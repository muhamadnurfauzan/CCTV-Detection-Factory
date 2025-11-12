# scheduler.py
import time
import datetime
import logging
from db.db_config import get_connection
from supabase import create_client
import config

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
        logging.info(f"[SCHEDULER] Rekap harian diperbarui untuk {datetime.date.today()}.")
    except Exception as e:
        logging.error(f"[SCHEDULER] Gagal update rekap harian: {e}")
    finally:
        cur.close()
        conn.close()

def cleanup_old_data():
    """Menghapus log & gambar yang lebih dari 14 hari."""
    conn = get_connection()
    cur = conn.cursor()
    # datetime.datetime.now() - datetime.timedelta(days=14) menghasilkan objek datetime yang dapat 
    # di-*pass* sebagai parameter %s ke PostgreSQL/Psycopg2 dengan aman.
    cutoff = datetime.datetime.now() - datetime.timedelta(days=14) 

    try:
        cur.execute("SELECT image FROM violation_detection WHERE timestamp < %s", (cutoff,))
        old_images = [r[0] for r in cur.fetchall()]
        # ... (Logika hapus Supabase tetap sama)
        
        # Hapus dari DB
        cur.execute("DELETE FROM violation_detection WHERE timestamp < %s", (cutoff,))
        conn.commit()
        logging.info(f"[SCHEDULER] Data dan gambar >14 hari dihapus.")
    except Exception as e:
        logging.error(f"[SCHEDULER] Gagal hapus data lama: {e}")
    finally:
        cur.close()
        conn.close()

def scheduler_thread():
    """Menjalankan update per jam & cleanup harian jam 00:05."""
    while True:
        now = datetime.datetime.now()
        minute = now.minute
        hour = now.hour

        # Jalankan rekap tiap awal jam
        if minute == 0:
            update_daily_log()

        # Jalankan pembersihan jam 00:05
        if hour == 0 and minute == 5:
            cleanup_old_data()

        time.sleep(60)  # cek tiap menit
