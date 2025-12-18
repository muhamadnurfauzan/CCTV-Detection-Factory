import datetime
import logging
from typing import Set
from db.db_config import get_connection
from shared_state import state
from core.detection import start_detection_for_cctv, stop_detection_for_cctv

logging.basicConfig(level=logging.INFO)

WEEKDAY_MAP = {
    0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
    4: 'thursday', 5: 'friday', 6: 'saturday'
}

def _current_wib_time():
    return datetime.datetime.now().astimezone(datetime.timezone(datetime.timedelta(hours=7)))

def is_cctv_active_now(cctv_id: int) -> bool:
    """
    Cek apakah CCTV dengan ID ini sedang dalam jadwal aktif saat ini (WIB).
    Dipanggil oleh detection.py sebelum proses frame.
    """
    now = _current_wib_time()
    current_day = now.weekday()  
    db_day = (current_day + 1) % 7 
    current_time = now.time()

    query = """
        SELECT 1 FROM cctv_scheduler 
        WHERE cctv_id = %s 
          AND day_of_week = %s 
          AND is_active = TRUE
          AND start_time <= %s 
          AND end_time >= %s
        LIMIT 1
    """

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (cctv_id, db_day, current_time, current_time))
                return cur.fetchone() is not None
    except Exception as e:
        logging.error(f"[SCHEDULER] Error checking schedule for CCTV {cctv_id}: {e}")
        return False 

def get_active_cctv_ids_now() -> Set[int]:
    now = _current_wib_time()
    current_day = (now.weekday() + 1) % 7
    current_time = now.time()

    # JOIN dengan cctv_data untuk memvalidasi status enabled
    query = """
        SELECT DISTINCT s.cctv_id 
        FROM cctv_scheduler s
        JOIN cctv_data d ON s.cctv_id = d.id
        WHERE s.day_of_week = %s
          AND s.is_active = TRUE
          AND d.enabled = TRUE
          AND s.start_time <= %s
          AND s.end_time >= %s
    """

    active_ids = set()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (current_day, current_time, current_time))
                for row in cur.fetchall():
                    active_ids.add(row[0])
    except Exception as e:
        logging.error(f"[SCHEDULER] Failed to get active CCTVs: {e}")

    return active_ids

# core/cctv_scheduler.py
def refresh_scheduler_state():
    active_now = get_active_cctv_ids_now()

    configs = list(state.cctv_configs.items())
    if not configs:
        logging.warning("[DEBUG] state.cctv_configs is empty!")
        return

    for cctv_id, config in configs:
        enabled = config.get('enabled', False)
        thread_info = state.detection_threads.get(cctv_id, {})
        
        # CEK FISIK: Apakah thread benar-benar hidup?
        is_alive = False
        if thread_info and 'threads' in thread_info:
            is_alive = any(t.is_alive() for t in thread_info['threads'])

        if not enabled:
            if is_alive:
                logging.info(f"[SCHEDULER] CCTV {cctv_id} master disabled, stopping.")
                stop_detection_for_cctv(cctv_id)
            continue

        should_have_yolo = cctv_id in active_now
        desired_mode = 'full' if should_have_yolo else 'stream_only'
        current_mode = thread_info.get('mode')

        # FORCE START jika thread mati atau mode salah
        if not is_alive or current_mode != desired_mode:
            logging.info(f"[SCHEDULER] TRIGGER START CCTV {cctv_id} Mode: {desired_mode}")
            try:
                start_detection_for_cctv(cctv_id, full_detection=should_have_yolo)
            except Exception as e:
                logging.error(f"[ERROR] Failed to start CCTV {cctv_id}: {e}")