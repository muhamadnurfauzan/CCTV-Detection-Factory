import logging
import numpy as np
from psycopg2.extras import RealDictCursor 
from shared_state import state
from db.db_config import get_connection

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
def load_roi_from_db(area_data):
    if not area_data:
        return [], 0, 0
    
    # area_data sekarang adalah dict (karena psycopg2 RealDictCursor)
    width = area_data.get("image_width", 0)
    height = area_data.get("image_height", 0)
    regions = []
    
    for item in area_data.get("items", []):
        regions.append({
            "name": item.get("name"),
            "points": np.array(item["points"], dtype=np.float32),
            "allowed_violations": item.get("allowed_violations", [])
        })
    return regions, width, height
    
# --- Muat konfigurasi semua CCTV aktif ---
def load_all_cctv_configs():
    configs = {}
    active_cctvs = get_all_active_cctv() 
    for cctv in active_cctvs:
        cctv_id = cctv["id"]
        area_data = cctv.get("area")
        
        regions = []
        w, h = 0, 0
        
        if area_data and isinstance(area_data, dict):
            for item in area_data.get("items", []):
                regions.append({
                    "points": np.array(item["points"], dtype=np.float32),
                    "allowed_violations": item.get("allowed_violations", []) 
                })
        
        configs[cctv_id] = {
            "name": cctv.get("name"),
            "roi": regions,
            "json_width": area_data.get("image_width", 0) if area_data else 0,
            "ip_address": cctv.get("ip_address"),
            "port": cctv.get("port"),
            "token": cctv.get("token"),
            "location": cctv.get("location")
        }
    return configs
    
# --- Fungsi baru untuk merefresh cache konfigurasi CCTV secara penuh ---
def refresh_all_cctv_configs():
    logging.info("[CONFIG] Refreshing all CCTV configurations from DB...")
    configs = load_all_cctv_configs()
    state.cctv_configs.clear()
    state.cctv_configs.update(configs)
    
    logging.info(f"[CONFIG] Loaded {len(state.cctv_configs)} active CCTV configs.")