import datetime
import logging
from typing import Set
from db.db_config import get_connection
from shared_state import state
from core.detection import start_detection_for_cctv, stop_detection_for_cctv

logging.basicConfig(level=logging.INFO)

WEEKDAY_MAP = {
    0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
    4: 'thrusday', 5: 'friday', 6: 'saturday'
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
    """
    Dipanggil saat startup atau refresh config.
    Return semua CCTV yang sedang dalam jadwal aktif.
    """
    now = _current_wib_time()
    current_day = (now.weekday() + 1) % 7
    current_time = now.time()

    query = """
        SELECT DISTINCT cctv_id FROM cctv_scheduler
        WHERE day_of_week = %s
          AND is_active = TRUE
          AND start_time <= %s
          AND end_time >= %s
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

def refresh_scheduler_state():
    active_now = get_active_cctv_ids_now()

    for cctv_id, config in state.cctv_configs.items():
        enabled = config.get('enabled', False)
        thread_info = state.detection_threads.get(cctv_id, {})
        current_mode = thread_info.get('mode')  # bisa None
        should_have_yolo = cctv_id in active_now
        
        # 3. CCTV disabled → matikan semua
        if not enabled:
            if cctv_id in state.detection_threads:
                logging.info(f"[SCHEDULER] CCTV {cctv_id} → Disabled, stopping all threads.")
                stop_detection_for_cctv(cctv_id)
            continue

        # Tentukan mode yang diinginkan
        desired_mode = 'full' if should_have_yolo else 'stream_only'

        # Hanya lakukan sesuatu jika:
        # - Belum ada thread sama sekali, ATAU
        # - Mode saat ini berbeda dari yang diinginkan
        if cctv_id not in state.detection_threads or current_mode != desired_mode:
            logging.info(f"[SCHEDULER] CCTV {cctv_id} → Switching to {desired_mode.upper()} "
                         f"(current: {current_mode})")
            start_detection_for_cctv(cctv_id, full_detection=should_have_yolo)
        else:
            # Sudah sesuai, diam saja
            pass
            # logging.debug(f"[SCHEDULER] CCTV {cctv_id} already in correct mode: {desired_mode}")