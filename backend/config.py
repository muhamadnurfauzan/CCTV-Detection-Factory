import os
import sys
import json
import numpy as np

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from db.db_config import get_connection

# --- Direktori Output ---
OUTPUT_DIR = "violations"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Model dan Pengaturan Umum ---
MODEL_PATH = "model/helm detection.pt"
CONFIDENCE_THRESHOLD = 0.3
COOLDOWN = 60
CLEANUP_INTERVAL = 60
PADDING_PERCENT = 0.5
TARGET_MAX_WIDTH = 320
FRAME_SKIP = 30
QUEUE_SIZE = 3
CCTV_RATIO = (1920, 1080)

# --- Definisi Kelas Model ---
PPE_CLASSES = {
    "helmet": True, "no-helmet": True, "vest": True, "no-vest": True,
    "boots": False, "no-boots": False, "gloves": False, "no-gloves": False,
    "googles": False, "no-googles": False,
}

PPE_COLORS = {
    "no-helmet": (255, 0, 255), "helmet": (0, 255, 0),
    "no-vest": (255, 255, 0), "vest": (0, 255, 255),
    "no-boots": (200, 100, 0), "boots": (0, 100, 200),
    "no-gloves": (100, 0, 200), "gloves": (200, 0, 100),
    "no-googles": (50, 50, 200), "googles": (200, 50, 50),
}

# --- Shared memory dict (diinisialisasi di app.py) ---
annotated_frames = None

# --- Fetch CCTV aktif dari database ---
def get_all_active_cctv():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM cctv_data WHERE enabled = TRUE;")
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    if not results:
        raise RuntimeError("Tidak ada CCTV aktif di database.")
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
    return configs

# --- Inisialisasi konfigurasi global ---
cctv_configs = load_all_cctv_configs()