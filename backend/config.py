# config.py
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
# CCTV_RATIO = (1280, 720)  # harus bisa dibagi 32

# --- Definisi Kelas Model ---
PPE_CLASSES = {
    "helmet": True,
    "no-helmet": True,
    "vest": True,
    "no-vest": True,
    "boots": False,
    "no-boots": False,
    "gloves": False,
    "no-gloves": False,
    "googles": False,
    "no-googles": False,
}

PPE_COLORS = {
    "no-helmet": (255, 0, 255),
    "helmet": (0, 255, 0),
    "no-vest": (255, 255, 0),
    "vest": (0, 255, 255),
    "no-boots": (200, 100, 0),
    "boots": (0, 100, 200),
    "no-gloves": (100, 0, 200),
    "gloves": (200, 0, 100),
    "no-googles": (50, 50, 200),
    "googles": (200, 50, 50),
}

# --- Add data CCTV dari MySQL ---
def get_active_cctv():
    """Ambil 1 CCTV yang enabled=True dari tabel MySQL."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM cctv_data WHERE enabled = TRUE;")
    result = cursor.fetchone()
    cursor.close()
    conn.close()

    if not result:
        raise RuntimeError("Tidak ada CCTV aktif di database.")
    return result

# --- Load CCTV dari MySQL ---
try:
    active_cctv = get_active_cctv()
    CCTV_ID = active_cctv["id"]
    CCTV_NAME = active_cctv.get("name", "Unknown Camera")
    LOCATION = active_cctv.get("location", "Unknown Location")
    IP_ADDRESS = active_cctv.get("ip_address")
    PORT = active_cctv.get("port")
    TOKEN = active_cctv.get("token")
    JSON_PATH = active_cctv.get("area", "Undefined ROI")

    # Buat URL video RTSP otomatis
    VIDEO_PATH = f"rtsps://{IP_ADDRESS}:{PORT}/{TOKEN}?enableSrtp"
except Exception as e:
    print(f"[WARNING] Gagal memuat CCTV aktif: {e}")
    CCTV_ID = None
    CCTV_NAME = "Undefined"
    LOCATION = "Undefined"
    VIDEO_PATH = None
    JSON_PATH = None

# --- ROI CONFIGURATION ---
roi_regions = []
json_image_width = 0
json_image_height = 0

def load_roi_from_json(json_path=JSON_PATH):
    """Memuat region of interest (ROI) dari file JSON."""
    global roi_regions, json_image_width, json_image_height
    if not json_path or not os.path.exists(json_path):
        print(f"[INFO] File ROI tidak ditemukan: {json_path}")
        return

    try:
        with open(json_path, "r") as f:
            data = json.load(f)
            json_image_width = data.get('image_width', 0)
            json_image_height = data.get('image_height', 0)
            roi_regions.clear()
            for item in data.get('items', []):
                if "points" in item:
                    roi_regions.append({
                        'type': item.get('type', 'undefined'),
                        'points': np.array(item["points"], dtype=np.float32)
                    })
        print(f"[INFO] ROI loaded: {len(roi_regions)} region(s)")
    except Exception as e:
        print(f"[ERROR] Gagal load ROI JSON: {e}")

# Load ROI saat startup
load_roi_from_json()