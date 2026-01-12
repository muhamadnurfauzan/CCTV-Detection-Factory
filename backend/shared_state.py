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
                cls._instance.scheduler_settings = {
                    'sched_cleanup_cutoff_days': 60,
                    'sched_cleanup_hour': 0,
                    'sched_cleanup_minute': 5,
                    'sched_daily_recap_minute': 0,
                    'sched_refresh_config_interval': 10,
                    'sched_monthly_date': 1,
                    'sched_monthly_hour': 7,
                    'sched_monthly_minute': 30,
                    'sched_weekly_day': 0,
                    'sched_weekly_hour': 7,
                    'sched_weekly_minute': 30,
                }
                cls._instance.active_model_filename = "ppe_detection_yolov12l.pt"
                
                cls._instance.MODEL_LOCK = Lock()
                cls._instance.DETECTION_SETTINGS_LOCK = Lock()
                cls._instance.SCHEDULER_SETTINGS_LOCK = Lock()
                cls._instance.ANNOTATED_FRAME_LOCK = Lock()          
                cls._instance.RAW_FRAME_LOCK = Lock()
        return cls._instance
    
# Instance global
state = SharedState()