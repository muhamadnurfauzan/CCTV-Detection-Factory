import os
from supabase import create_client, Client
from dotenv import load_dotenv
from shared_state import state

# Load environment variables
load_dotenv()

# --- Model dan Pengaturan Umum ---
MODEL_PATH = "model/ppe_detection_yolov12.pt"
CCTV_RATIO = (1920, 1080)

CONFIDENCE_THRESHOLD = state.detection_settings['confidence_threshold']
COOLDOWN = state.detection_settings['cooldown_seconds']
CLEANUP_INTERVAL = state.detection_settings['cleanup_interval']
FRAME_SKIP = state.detection_settings['frame_skip']
QUEUE_SIZE = state.detection_settings['queue_size']
PADDING_PERCENT = state.detection_settings['padding_percent']
TARGET_MAX_WIDTH = state.detection_settings['target_max_width']

# --- Supabase Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "violations")
SUPABASE_ROI_DIR = "roi_json"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)