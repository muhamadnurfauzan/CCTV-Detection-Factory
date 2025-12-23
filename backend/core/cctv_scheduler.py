import datetime
import logging
from typing import Set
from db.db_config import get_connection
from shared_state import state

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