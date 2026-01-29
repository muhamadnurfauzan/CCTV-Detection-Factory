import os
from dotenv import load_dotenv
from shared_state import state

# Load environment variables
load_dotenv()

# --- Detection Settings ---
CCTV_RATIO = (1920, 1080)

CONFIDENCE_THRESHOLD = state.detection_settings['confidence_threshold']
COOLDOWN = state.detection_settings['cooldown_seconds']
CLEANUP_INTERVAL = state.detection_settings['cleanup_interval']
FRAME_SKIP = state.detection_settings['frame_skip']
QUEUE_SIZE = state.detection_settings['queue_size']
PADDING_PERCENT = state.detection_settings['padding_percent']
TARGET_MAX_WIDTH = state.detection_settings['target_max_width']

# --- Local Storage Configuration ---
BASE_STORAGE_PATH = os.path.join(os.getcwd(), "public", "cctv")