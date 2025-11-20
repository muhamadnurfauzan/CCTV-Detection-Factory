import os
from supabase import create_client, Client
from dotenv import load_dotenv
from shared_state import state

# Load environment variables
load_dotenv()
    
annotated_frames = state.annotated_frames
ANNOTATED_FRAME_LOCK = state.ANNOTATED_FRAME_LOCK

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

# --- Supabase Configuration ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "violations")
SUPABASE_ROI_DIR = "roi_json"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)