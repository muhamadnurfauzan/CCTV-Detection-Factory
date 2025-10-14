import os

# --- Konfigurasi ---
VIDEO_PATH = "rtsps://192.168.199.9:7441/sKDBmnGEmed2VzuM?enableSrtp"  # CCTV URL
OUTPUT_DIR = "violations"
CONFIDENCE_THRESHOLD = 0.3  # Untuk PPE model
MODEL_PATH = "model/helm detection.pt"  # PPE model
COOLDOWN = 60  # Cooldown detik
CLEANUP_INTERVAL = 60  # Hapus track kalau hilang >60 detik
PADDING_PERCENT = 0.5  # Expand bounding box
TARGET_MAX_WIDTH = 320  # Resize untuk polaroid
LOCATION = "Plant A"
JSON_PATH = "JSON/cctv_area.json"
FRAME_SKIP = 10  # Naikkan untuk optimasi memori (proses setiap 10 frame)
RESIZE_SCALE = 0.9  # Turunkan untuk kurangi beban memori
QUEUE_SIZE = 5  # Kurangi max frame di queue

# --- Kostumisasi Kelas PPE ---
PPE_CLASSES = {
    "helmet": True,
    "no-helmet": True,
    "vest": True,
    "no-vest": True,
    "boots": False,
    "no-boots": False,
    "gloves": False,
    "no-gloves": False,
    "goggles": False,
    "no-goggles": False,
}

ppe_colors = {
    "no-helmet": (255, 0, 255),  # Magenta
    "helmet": (128, 0, 128),     # Ungu
    "no-vest": (255, 0, 0),      # Biru
    "vest": (0, 255, 255),       # Cyan
    "no-boots": (0, 165, 255),   # Oranye
    "boots": (255, 255, 0),      # Kuning
    "no-gloves": (0, 255, 0),    # Hijau
    "gloves": (0, 128, 0),       # Hijau Tua
    "no-goggles": (0, 0, 255),   # Merah
    "goggles": (255, 192, 203),  # Pink
}

os.makedirs(OUTPUT_DIR, exist_ok=True)