import os
import sys
import json
import time
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# --- Model dan Pengaturan Umum ---
MODEL_PATH = "model/helm detection.pt"
CONFIDENCE_THRESHOLD = 0.5
COOLDOWN = 60
CLEANUP_INTERVAL = 60
PADDING_PERCENT = 0.5
TARGET_MAX_WIDTH = 320
FRAME_SKIP = 15
QUEUE_SIZE = 3
CCTV_RATIO = (1920, 1080)

cctv_streams = {}        # {id: {url, enabled, name}}
detection_threads = {}   # {id: thread}
annotated_frames = {}    # {id: np.array}
active_violations = {}   # {cctv_id: [class_id]}

# Cache global dengan TTL (30 detik)
OBJECT_CLASS_CACHE = {}
VIOLATION_CLASS_IDS = {}
ACTIVE_VIOLATION_CACHE = {}
_CACHE_TIMESTAMP = 0
_CACHE_TTL = 30  # detik

# --- Supabase Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "violations")
SUPABASE_ROI_DIR = "roi_json"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- PostgreSQL Connection ---
def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT"),
        sslmode=os.getenv("DB_SSLMODE", "require")
    )

# --- Object PPE Configuration ---
def load_object_classes(force_refresh=False):
    global OBJECT_CLASS_CACHE, VIOLATION_CLASS_IDS, _CACHE_TIMESTAMP
    now = time.time()
    if force_refresh or now - _CACHE_TIMESTAMP > _CACHE_TTL:
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("SELECT id, name, color_r, color_g, color_b, is_violation FROM object_class")
            rows = cur.fetchall()
            OBJECT_CLASS_CACHE = {}
            VIOLATION_CLASS_IDS = {}
            for row in rows:
                cid, name, r, g, b, is_viol = row
                OBJECT_CLASS_CACHE[name] = {
                    "id": cid,
                    "color": (r, g, b) if r is not None else (255, 255, 255),
                    "is_violation": is_viol
                }
                if is_viol:
                    VIOLATION_CLASS_IDS[cid] = name
            cur.close(); conn.close()
            _CACHE_TIMESTAMP = now
            if not OBJECT_CLASS_CACHE:
                print("[CACHE] WARNING: Object classes kosong dari DB!")
        except Exception as e:
            print(f"[CACHE] ERROR: Gagal load object_classes: {e}")

# Panggil di startup
load_object_classes()

# --- Fetch CCTV aktif dari database ---
def get_all_active_cctv():
    conn = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM cctv_data WHERE enabled = TRUE;")
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    if not results:
        return [] 
    return results

# --- ROI Loader ) ---
def load_roi_from_json(area_field):
    if not area_field:
        return [], 0, 0
        
    storage_path = f"{SUPABASE_ROI_DIR}/{area_field}" # area_field adalah nama file (e.g., cctv_1.json)
    
    try:
        # 1. Unduh konten file dari Supabase
        # Gunakan klien Supabase untuk mengunduh konten biner file
        res = supabase.storage.from_(SUPABASE_BUCKET).download(storage_path)
        
        # 2. Decode konten biner menjadi string JSON
        json_content = res.decode('utf-8')
        
        # 3. Parse JSON dari string
        data = json.loads(json_content)
        
        # ... (Logika parsing yang tersisa)
        width = data.get("image_width", 0)
        height = data.get("image_height", 0)
        regions = []
        for item in data.get("items", []):
            if "points" in item:
                # np.array import dari numpy
                regions.append({
                    "type": item.get("type", "polygon"),
                    "points": np.array(item["points"], dtype=np.float32),
                })
        print(f"[ROI] Loaded from Supabase: {storage_path}")
        return regions, width, height
    except Exception as e:
        # Jika file tidak ditemukan (404 dari Supabase) atau gagal di-parse
        print(f"[ROI LOAD ERROR from Supabase]: {e}")
        return [], 0, 0

# --- Muat konfigurasi semua CCTV aktif ---
def load_all_cctv_configs():
    configs = {}
    try:
        active_cctvs = get_all_active_cctv()
        for cctv in active_cctvs:
            cctv_id = cctv["id"]
            roi, w, h = load_roi_from_json(cctv.get("area")) 
            configs[cctv_id] = {
                "name": cctv.get("name", f"CCTV {cctv_id}"),
                "location": cctv.get("location", "Unknown"),
                "ip_address": cctv.get("ip_address"),
                "port": cctv.get("port"),
                "token": cctv.get("token"),
                "roi": roi,
                "json_width": w,
                "json_height": h,
                "enabled": cctv.get("enabled", False)
            }
    except Exception as e:
        print(f"[ERROR] Gagal memuat konfigurasi CCTV: {e}")
    return configs

# --- Fungsi baru untuk merefresh cache konfigurasi CCTV secara penuh ---
def refresh_all_cctv_configs():
    global cctv_configs
    print("[CONFIG] Refreshing all CCTV configurations from DB...")
    cctv_configs = load_all_cctv_configs()
    print(f"[CONFIG] Loaded {len(cctv_configs)} active CCTV configs.")
    
# --- Fetch jenis violation yang aktif dari CCTV secara custom ---
def get_active_violation_ids_for_cctv(cctv_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT oc.id 
        FROM cctv_violation_config cvc
        JOIN object_class oc ON cvc.class_id = oc.id
        WHERE cvc.cctv_id = %s AND cvc.is_active = true
    """, (cctv_id,))
    ids = [row[0] for row in cur.fetchall()]
    cur.close(); conn.close()
    return ids

# --- Muat pasangan pelanggaran PPE dari database ---
def load_violation_pairs():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, pair_id FROM object_class WHERE pair_id IS NOT NULL;")
    rows = cur.fetchall()
    cur.close(); conn.close()

    pairs = {}
    for id_, pair_id in rows:
        pairs[id_] = pair_id
        pairs[pair_id] = id_  # buat simetris

    print(f"[PAIR CACHE] Loaded {len(pairs)//2} PPE pairs.")
    return pairs

# Panggil saat startup
PPE_VIOLATION_PAIRS = load_violation_pairs()

# Fungsi helper untuk color
def get_color_for_class(class_name):
    return OBJECT_CLASS_CACHE.get(class_name, {}).get("color", (255, 255, 255))

# --- Cache aktif violation per CCTV ---
def refresh_active_violations():
    conn = get_connection()
    cur = conn.cursor()
    # Bukan dari object_class, tapi dari cctv_violation_config
    cur.execute("""
        SELECT cvc.cctv_id, oc.id
        FROM cctv_violation_config cvc
        JOIN object_class oc ON cvc.class_id = oc.id
        WHERE cvc.is_active = true
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()

    ACTIVE_VIOLATION_CACHE.clear()
    for cctv_id, class_id in rows:
        ACTIVE_VIOLATION_CACHE.setdefault(cctv_id, []).append(class_id)

    print(f"[ACTIVE CACHE] Updated: {ACTIVE_VIOLATION_CACHE}")

# --- Inisialisasi konfigurasi global ---
try:
    cctv_configs = load_all_cctv_configs()
except Exception as e:
    print("[WARNING] CCTV config belum dapat dimuat:", e)
    cctv_configs = {}
