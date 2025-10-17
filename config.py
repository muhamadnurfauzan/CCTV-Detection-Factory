# config.py
import os
import json
import numpy as np

VIDEO_PATH = "rtsps://192.168.199.9:7441/sKDBmnGEmed2VzuM?enableSrtp"
OUTPUT_DIR = "violations"
CONFIDENCE_THRESHOLD = 0.3
MODEL_PATH = "model/helm detection.pt"
COOLDOWN = 60
CLEANUP_INTERVAL = 60
PADDING_PERCENT = 0.5
TARGET_MAX_WIDTH = 320
LOCATION = "Plant A"
JSON_PATH = "JSON/cctv_area.json"
FRAME_SKIP = 15
RESIZE_SCALE = 0.9
QUEUE_SIZE = 3

PPE_CLASSES = {
    "helmet": True,
    "no-helmet": True,
    "vest": True,
    "no-vest": True,
}

ppe_colors = {
    "no-helmet": (255, 0, 255),
    "helmet": (0, 255, 0),
    "no-vest": (255, 255, 0),
    "vest": (0, 255, 255),
}

roi_regions = []
json_image_width = 0
json_image_height = 0

def load_roi_from_json(json_path=JSON_PATH):
    global roi_regions, json_image_width, json_image_height
    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
            json_image_width = data.get('image_width', 0)
            json_image_height = data.get('image_height', 0)
            for item in data.get('items', []):
                points = item['points']
                roi_regions.append({
                    'type': item['type'],
                    'points': np.array(points, dtype=np.float32)
                })
    except Exception as e:
        print(f"Gagal load JSON: {e}")

load_roi_from_json()
os.makedirs(OUTPUT_DIR, exist_ok=True)