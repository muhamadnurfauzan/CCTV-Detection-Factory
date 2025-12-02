from threading import Lock
import numpy as np

class SharedState:
    _instance = None
    _lock = Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance.annotated_frames = {}
                cls._instance.raw_frames = {} 
                cls._instance.detection_threads = {}
                cls._instance.cctv_streams = {}
                cls._instance.cctv_configs = {}
                cls._instance.active_violations = {}

                cls._instance._CACHE_TIMESTAMP = 0
                cls._instance._CACHE_TTL = 30
                
                cls._instance.PPE_VIOLATION_PAIRS = {}
                cls._instance.CCTV_ALLOWED_VIOLATIONS = {}
                cls._instance.OBJECT_CLASS_CACHE = {}
                cls._instance.VIOLATION_CLASS_IDS = {}
                cls._instance.ACTIVE_VIOLATION_CACHE = {}
                cls._instance.GLOBAL_EMAIL_CONFIG = {
                    "host": None, 
                    "port": None, 
                    "user": None, 
                    "pass": None, 
                    "from": None, 
                    "enable_auto_email": False
                }
                cls._instance.detection_settings = {
                    'confidence_threshold': 0.5,
                    'cooldown_seconds': 5,
                    'cleanup_interval': 180,
                    'frame_skip': 15,
                    'queue_size': 3,
                    'padding_percent': 0.5,
                    'target_max_width': 320,
                }

                cls._instance.DETECTION_SETTINGS_LOCK = Lock()
                cls._instance.ANNOTATED_FRAME_LOCK = Lock()          
                cls._instance.RAW_FRAME_LOCK = Lock()
        return cls._instance
    
# Instance global
state = SharedState()