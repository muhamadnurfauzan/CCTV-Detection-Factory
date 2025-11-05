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
 

# Cache global dengan TTL (30 detik)
OBJECT_CLASS_CACHE = {}
VIOLATION_CLASS_IDS = {}
_CACHE_TIMESTAMP = 0
_CACHE_TTL = 30  # detik

# --- Supabase Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "violations")

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
                "color": (r, g, b) if r is not None else (255, 255, 255),  # Fallback white
                "is_violation": is_viol
            }
            if is_viol:
                VIOLATION_CLASS_IDS[cid] = name
        cur.close(); conn.close()
        _CACHE_TIMESTAMP = now
        if not OBJECT_CLASS_CACHE:
            print("[CACHE] Object classes kosong — fallback ke default?")

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
        raise RuntimeError("No CCTV Active")
    return results

# --- ROI Loader ---
def load_roi_from_json(json_path):
    if not json_path or not os.path.exists(json_path):
        return [], 0, 0
    try:
        with open(json_path, "r") as f:
            data = json.load(f)
            width = data.get("image_width", 0)
            height = data.get("image_height", 0)
            regions = []
            for item in data.get("items", []):
                if "points" in item:
                    regions.append({
                        "type": item.get("type", "undefined"),
                        "points": np.array(item["points"], dtype=np.float32),
                    })
            return regions, width, height
    except Exception as e:
        print(f"[ERROR] Gagal load ROI JSON: {e}")
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
            }
    except Exception as e:
        print(f"[ERROR] Gagal memuat konfigurasi CCTV: {e}")
    return configs

# --- Fetch jenis violation yang aktif dari CCTV secara custom ---
def get_active_violation_ids_for_cctv(cctv_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT class_id FROM cctv_violation_config
        WHERE cctv_id = %s AND is_active = TRUE
    """, (cctv_id,))
    active = {row[0] for row in cur.fetchall()}
    cur.close(); conn.close()
    return active

# Fungsi helper untuk color
def get_color_for_class(class_name):
    return OBJECT_CLASS_CACHE.get(class_name, {}).get("color", (255, 255, 255))

# --- Inisialisasi konfigurasi global ---
try:
    cctv_configs = load_all_cctv_configs()
except Exception as e:
    print("[WARNING] CCTV config belum dapat dimuat:", e)
    cctv_configs = {}
