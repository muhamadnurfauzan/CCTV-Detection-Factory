# config.py
import os
import json
import numpy as np

OUTPUT_DIR = "violations"
MODEL_PATH = "model/helm detection.pt"
CONFIDENCE_THRESHOLD = 0.3
COOLDOWN = 60
CLEANUP_INTERVAL = 60
PADDING_PERCENT = 0.5
TARGET_MAX_WIDTH = 320
FRAME_SKIP = 30
QUEUE_SIZE = 1
CCTV_RATIO = (640, 352) # harus bisa dibagi 32

# CLASS MODEL DEFINITION
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

# DATABASE CCTV
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../db/data_cctv.json"))

def load_cctv_data():
    """Membaca seluruh data CCTV dari file JSON."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database file not found: {DB_PATH}")

    with open(DB_PATH, "r") as file:
        try:
            data = json.load(file)
        except json.JSONDecodeError as e:
            raise ValueError(f"Error parsing JSON database: {e}")
    return data

def get_enabled_cctv():
    """Mengambil CCTV pertama yang aktif (enabled=True)."""
    cctvs = load_cctv_data()
    for cam in cctvs:
        if cam.get("enabled", False):
            return cam
    raise RuntimeError("Tidak ada CCTV yang aktif dalam database.")

try:
    active_cctv = get_enabled_cctv()
    CCTV_ID = active_cctv["id"]
    CCTV_NAME = active_cctv.get("name", "Unknown Camera")
    LOCATION = active_cctv.get("location", "Unknown Location")
    IP_ADDRESS = active_cctv.get("ip_address")
    PORT = active_cctv.get("port")
    TOKEN = active_cctv.get("token")
    JSON_PATH = active_cctv.get("area", "Undefined ROI")

    # Buat RTSP URL otomatis
    VIDEO_PATH = f"rtsps://{IP_ADDRESS}:{PORT}/{TOKEN}?enableSrtp"

except Exception as e:
    print(f"[WARNING] Gagal memuat CCTV aktif: {e}")
    CCTV_ID = None
    CCTV_NAME = "Undefined"
    LOCATION = "Undefined"
    VIDEO_PATH = None

#JSON ROI CONFIGURATION
roi_regions = []
json_image_width = 0
json_image_height = 0

def load_roi_from_json(json_path=JSON_PATH):
    """Memuat region of interest (ROI) dari file JSON."""
    global roi_regions, json_image_width, json_image_height
    try:
        if not os.path.exists(json_path):
            print(f"[INFO] File ROI tidak ditemukan: {json_path}")
            return

        with open(json_path, "r") as f:
            data = json.load(f)
            json_image_width = data.get('image_width', 0)
            json_image_height = data.get('image_height', 0)
            roi_regions.clear()
            for item in data.get('items', []):
                if "points" in item:
                    points = item["points"]
                    roi_regions.append({
                        'type': item.get('type', 'undefined'),
                        'points': np.array(points, dtype=np.float32)
                    })
        print(f"[INFO] ROI loaded: {len(roi_regions)} region(s)")

    except Exception as e:
        print(f"[ERROR] Gagal load ROI JSON: {e}")
    
load_roi_from_json()
os.makedirs(OUTPUT_DIR, exist_ok=True)