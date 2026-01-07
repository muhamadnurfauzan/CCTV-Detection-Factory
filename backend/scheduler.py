# scheduler.py
import time
import datetime
import logging
from shared_state import state
from db.db_config import get_connection
from supabase import create_client
from services.cctv_services import refresh_all_cctv_configs
from services.notification_service import send_violation_recap_emails
from services.config_service import load_scheduler_settings
import config as config

supabase = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

def update_daily_log():
    """Melakukan rekap data harian dari violation_detection (PostgreSQL)."""
    conn = get_connection()
    cur = conn.cursor()
    # today = datetime.date.today() # Tidak perlu karena menggunakan CURRENT_DATE dalam SQL

    try:
        cur.execute("""
            INSERT INTO violation_daily_log (log_date, id_cctv, id_violation, total_violation)
            SELECT DATE(timestamp), id_cctv, id_violation, COUNT(*)
            FROM violation_detection
            WHERE DATE(timestamp) = CURRENT_DATE -- Mengganti CURDATE()
            GROUP BY 1, 2, 3
            ON CONFLICT (log_date, id_cctv, id_violation) DO UPDATE -- Mengganti ON DUPLICATE KEY UPDATE
            SET
                total_violation = violation_daily_log.total_violation + EXCLUDED.total_violation,
                latest_update = CURRENT_TIMESTAMP;
        """)
        # Menghapus loop dan query INSERT kedua yang tidak diperlukan.
        
        conn.commit()
    except Exception as e:
        logging.error(f"[SCHEDULER] Gagal update rekap harian: {e}")
    finally:
        cur.close()
        conn.close()

def cleanup_old_data():
    """Menghapus log & gambar yang lebih dari 60 hari."""
    conn = get_connection()
    cur = conn.cursor()
    # datetime.datetime.now() - datetime.timedelta(days=60) menghasilkan objek datetime yang dapat 
    # di-*pass* sebagai parameter %s ke PostgreSQL/Psycopg2 dengan aman.
    cutoff_days = state.scheduler_settings.get('sched_cleanup_cutoff_days', 60)

    try:
        cur.execute("SELECT image FROM violation_detection WHERE timestamp < %s", (cutoff_days,))
        
        # Hapus dari DB
        cur.execute("DELETE FROM violation_detection WHERE timestamp < %s", (cutoff_days,))
        conn.commit()
        logging.info(f"[SCHEDULER] Data dan gambar >60 hari dihapus.")
    except Exception as e:
        logging.error(f"[SCHEDULER] Gagal hapus data lama: {e}")
    finally:
        cur.close()
        conn.close()

def scheduler_thread():
    load_scheduler_settings()
    
    while True:
        time.sleep(60)
        now = datetime.datetime.now()
        s = state.scheduler_settings
        
        # Info waktu saat ini
        weekday = now.weekday()      # 0=Mon, 6=Sun
        day_of_month = now.day       # 1-31
        hour = now.hour
        minute = now.minute

        # --- 1. DAILY RECAP ---
        if minute == s.get('sched_daily_recap_minute', 0):
            update_daily_log()

        # --- 2. WEEKLY RECAP ---
        if weekday == s.get('sched_weekly_day', 0) and \
           hour == s.get('sched_weekly_hour', 7) and \
           minute == s.get('sched_weekly_minute', 30):
            
            logging.info("[SCHEDULER] Triggering Weekly Recap...")
            if not (day_of_month == 1):
                # end_date: Senin ini pukul 00:00 (Data Minggu malam akan terambil karena '< end_date')
                end_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
                # start_date: Senin minggu lalu pukul 00:00
                start_date = end_date - datetime.timedelta(days=7) 
                
                send_violation_recap_emails(
                    start_date=start_date, 
                    end_date=end_date, 
                    template_key='violation_weekly_recap'
                )

        # --- 3. MONTHLY RECAP (With Edge Case Handling) ---
        target_date = s.get('sched_monthly_date', 1)
        # Cek apakah hari ini adalah hari terakhir di bulan ini
        is_last_day = (now + datetime.timedelta(days=1)).day == 1
        
        # Logic: Jalankan jika tanggal cocok, ATAU jika user minta tanggal 31 tapi hari ini hari terakhir (Feb)
        should_run_monthly = (day_of_month == target_date) or (target_date > day_of_month and is_last_day)
        
        if should_run_monthly and \
           hour == s.get('sched_monthly_hour', 7) and \
           minute == s.get('sched_monthly_minute', 30):
            
            logging.info("[SCHEDULER] Triggering Monthly Recap...")
            end_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            # start_date: Tanggal 1 bulan lalu pukul 00:00
            last_month = now.replace(day=1) - datetime.timedelta(days=1)
            start_date = last_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            send_violation_recap_emails(
                start_date=start_date, 
                end_date=end_date, 
                template_key='violation_monthly_recap' 
            )

        # --- 4. CLEANUP ---
        if hour == s.get('sched_cleanup_hour', 0) and \
           minute == s.get('sched_cleanup_minute', 5):
            cleanup_old_data()

        # --- 5. REFRESH CONFIG ---
        refresh_interval = s.get('sched_refresh_config_interval', 10)
        if minute % refresh_interval == 0:
            refresh_all_cctv_configs()
            load_scheduler_settings()

if __name__ == "__main__":
    logging.info("Starting standalone Scheduler service...")
    scheduler_thread()