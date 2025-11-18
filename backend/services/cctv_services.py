import json
import numpy as np
from psycopg2.extras import RealDictCursor 
import config
from shared import state
from db.db_config import get_connection
from config import ( SUPABASE_ROI_DIR, SUPABASE_BUCKET )

# --- Fetch CCTV aktif dari database ---
def get_all_active_cctv():
    conn = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM cctv_data WHERE enabled = true ORDER BY id ASC;")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows

# --- Load ROI dari Supabase Storage ---
def load_roi_from_json(area_field):
    if not area_field:
        return [], 0, 0
        
    storage_path = f"{SUPABASE_ROI_DIR}/{area_field}" # area_field adalah nama file (e.g., cctv_1.json)
    
    try:
        # 1. Unduh konten file dari Supabase
        res = config.supabase.storage.from_(SUPABASE_BUCKET).download(storage_path)
        
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
                regions.append({
                    "type": item.get("type", "polygon"),
                    "points": np.array(item["points"], dtype=np.float32),
                })
        return regions, width, height
    except Exception as e:
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
    print("[CONFIG] Refreshing all CCTV configurations from DB...")
    configs = load_all_cctv_configs()
    state.cctv_configs.clear()
    state.cctv_configs.update(configs)
    print(f"[CONFIG] Loaded {len(state.cctv_configs)} active CCTV configs.")