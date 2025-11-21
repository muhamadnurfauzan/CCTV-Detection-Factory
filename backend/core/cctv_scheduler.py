import datetime
import logging
from typing import Set
from db.db_config import get_connection

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
    current_day = now.weekday()  # 0=Monday ... 6=Sunday → kita pakai ISO (Senin=0)
    # Konversi ke skema DB: 0=Minggu, 1=Senin, ..., 6=Sabtu
    db_day = (current_day + 1) % 7  # Senin=0 → 1, Minggu=6 → 0
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
        return False  # fail-safe: jika error, matikan deteksi

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
    """
    Dipanggil oleh scheduler.py (yang sudah ada) tiap menit via APScheduler.
    Update state.cctv_configs[...]['scheduled_active'] = True/False
    Lalu trigger start/stop detection otomatis.
    """
    from shared_state import state
    from core.detection import start_detection_for_cctv, stop_detection_for_cctv

    active_now = get_active_cctv_ids_now()

    for cctv_id, config in state.cctv_configs.items():
        should_be_active = cctv_id in active_now and config.get('enabled', False)
        currently_running = cctv_id in state.detection_threads

        if should_be_active and not currently_running:
            logging.info(f"[SCHEDULER] CCTV {cctv_id} ({config['name']}) masuk jadwal → mulai deteksi")
            start_detection_for_cctv(cctv_id)
        elif not should_be_active and currently_running:
            logging.info(f"[SCHEDULER] CCTV {cctv_id} ({config['name']}) keluar jadwal → hentikan deteksi")
            stop_detection_for_cctv(cctv_id)