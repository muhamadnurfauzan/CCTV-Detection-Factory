# scheduler.py
import time
import datetime
import logging
from db.db_config import get_connection
from supabase import create_client
import config

supabase = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

def update_daily_log():
    """Melakukan rekap data harian dari violation_detection."""
    conn = get_connection()
    cur = conn.cursor()
    today = datetime.date.today()

    try:
        cur.execute("""
            INSERT INTO violation_daily_log (log_date, id_cctv, id_violation, total_violation)
            SELECT DATE(timestamp), id_cctv, id_violation, COUNT(*)
            FROM violation_detection
            WHERE DATE(timestamp) = CURDATE()
            GROUP BY id_cctv, id_violation
            ON DUPLICATE KEY UPDATE
                total_violation = violation_daily_log.total_violation + VALUES(total_violation),
                latest_update = CURRENT_TIMESTAMP;
        """)
        rows = cur.fetchall()

        for id_cctv, id_violation, total in rows:
            cur.execute("""
                INSERT INTO violation_daily_log (log_date, id_cctv, id_violation, total_violation)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    total_violation = VALUES(total_violation),
                    latest_update = CURRENT_TIMESTAMP;
            """, (today, id_cctv, id_violation, total))

        conn.commit()
        logging.info(f"[SCHEDULER] Rekap harian diperbarui untuk {today}.")
    except Exception as e:
        logging.error(f"[SCHEDULER] Gagal update rekap harian: {e}")
    finally:
        cur.close()
        conn.close()

def cleanup_old_data():
    """Menghapus log & gambar yang lebih dari 7 hari."""
    conn = get_connection()
    cur = conn.cursor()
    cutoff = datetime.datetime.now() - datetime.timedelta(days=7)

    try:
        cur.execute("SELECT image FROM violation_detection WHERE timestamp < %s", (cutoff,))
        old_images = [r[0] for r in cur.fetchall()]

        # Hapus dari Supabase
        for img_url in old_images:
            try:
                path = img_url.split("/storage/v1/object/public/")[-1].split("/", 1)[-1]
                supabase.storage.from_(config.SUPABASE_BUCKET).remove([path])
            except Exception as e:
                logging.warning(f"[SCHEDULER] Gagal hapus gambar {img_url}: {e}")

        # Hapus dari DB
        cur.execute("DELETE FROM violation_detection WHERE timestamp < %s", (cutoff,))
        conn.commit()
        logging.info(f"[SCHEDULER] Data dan gambar >7 hari dihapus.")
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
