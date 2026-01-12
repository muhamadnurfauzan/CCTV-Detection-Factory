import logging
import numpy as np
from psycopg2.extras import RealDictCursor 
from shared_state import state
from db.db_config import get_connection

# --- Fetch CCTV aktif dari database ---
def get_all_active_cctv():
    conn = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM cctv_data WHERE enabled = True ORDER BY id ASC;")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows
    
# --- Muat konfigurasi semua CCTV aktif ---
def load_all_cctv_configs():
    configs = {}
    active_cctvs = get_all_active_cctv() 
    for cctv in active_cctvs:
        cctv_id = cctv["id"]
        area_data = cctv.get("area")
        
        regions = []
        if area_data and isinstance(area_data, dict):
            for item in area_data.get("items", []):
                regions.append({
                    "name": item.get("name", "Unknown Area"),
                    "points": np.array(item["points"], dtype=np.float32),
                    "allowed_violations": item.get("allowed_violations", []) 
                })
        
        # PERBAIKAN: Masukkan key "enabled" ke dalam dictionary configs
        configs[cctv_id] = {
            "name": cctv.get("name"),
            "roi": regions,
            "json_width": area_data.get("image_width", 0) if area_data else 0,
            "json_height": area_data.get("image_height", 0) if area_data else 0, # Tambahkan height juga
            "enabled": cctv.get("enabled", False), 
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

# --- Fungsi untuk mengelola model AI yang aktif dari database ---
def get_active_model_from_db():
    """Mengambil filename model yang is_active = True dari database."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT filename FROM ai_models WHERE is_active = TRUE LIMIT 1")
        row = cur.fetchone()
        return row[0] if row else "ppe_detection_yolov12l.pt" # Fallback
    except Exception as e:
        logging.error(f"[DB] Gagal mengambil model aktif: {e}")
        return "ppe_detection_yolov12n.pt"
    finally:
        cur.close()
        conn.close()

# --- Fungsi untuk memperbarui model AI yang aktif di database ---
def update_model_activation_in_db(model_id):
    """Menonaktifkan semua model dan mengaktifkan satu model terpilih."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        # 1. Reset semua menjadi false
        cur.execute("UPDATE ai_models SET is_active = FALSE")
        # 2. Set model terpilih menjadi true
        cur.execute("UPDATE ai_models SET is_active = TRUE WHERE id = %s RETURNING filename", (model_id,))
        result = cur.fetchone()
        conn.commit()
        return result[0] if result else None
    except Exception as e:
        conn.rollback()
        logging.error(f"[DB] Gagal update aktivasi model: {e}")
        return None
    finally:
        cur.close()
        conn.close()