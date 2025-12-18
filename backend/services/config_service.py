
import time
import logging
from psycopg2.extras import RealDictCursor
from shared_state import state
from db.db_config import get_connection

# --- Fungsi untuk Memuat Konfigurasi Email dari DB (Tabel email_settings) ---
def load_email_config():
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, enable_auto_email FROM email_settings LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()

        if row:
            state.GLOBAL_EMAIL_CONFIG.update({
                "host": row['smtp_host'],
                "port": int(row['smtp_port']) if row['smtp_port'] else 587,
                "user": row['smtp_user'],
                "pass": row['smtp_pass'],
                "from": row['smtp_from'] or row['smtp_user'],
                "enable_auto_email": bool(row['enable_auto_email'])
            })
        else:
            logging.warning("[CONFIG] Tabel email_settings kosong!")
    except Exception as e:
        logging.error(f"[CONFIG] Gagal load email config: {e}")

# --- Object PPE Configuration ---
def load_object_classes(force_refresh=False):
    now = time.time()
    if force_refresh or now - state._CACHE_TIMESTAMP > state._CACHE_TTL:
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("SELECT id, name, color_r, color_g, color_b, is_violation FROM object_class")
            rows = cur.fetchall()
            for row in rows:
                cid, name, r, g, b, is_viol = row
                color_bgr = (b, g, r) if r is not None else (255, 255, 255)
                state.OBJECT_CLASS_CACHE[name] = {
                    "id": cid,
                    "color": color_bgr,
                    "is_violation": is_viol
                }
                if is_viol:
                    state.VIOLATION_CLASS_IDS[cid] = name
            cur.close(); conn.close()
            state._CACHE_TIMESTAMP = now
            if not state.OBJECT_CLASS_CACHE:
                logging.warning("[CACHE] WARNING: Object classes kosong dari DB!")
        except Exception as e:
            logging.error(f"[CACHE] ERROR: Gagal load object_classes: {e}")
    
# --- Muat pasangan pelanggaran PPE dari database ---
def load_violation_pairs():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, pair_id FROM object_class WHERE pair_id IS NOT NULL;")
    rows = cur.fetchall()
    cur.close(); conn.close()

    pairs = {}
    for id_, pair_id in rows:
        pairs[id_] = pair_id
        pairs[pair_id] = id_  # buat simetris

    state.PPE_VIOLATION_PAIRS.clear()
    state.PPE_VIOLATION_PAIRS.update(pairs)

# --- Reload detection settings ---
def load_detection_settings(force=False):
    """
    Load semua detection settings dari DB ke state.detection_settings
    Dipanggil saat startup dan setiap ada perubahan dari admin
    """
    with state.DETECTION_SETTINGS_LOCK:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM detection_settings")
        new_settings = {row[0]: float(row[1]) for row in cur.fetchall()}
        cur.close()
        conn.close()
        
        state.detection_settings.clear()
        state.detection_settings.update(new_settings)
        
        logging.info("[CONFIG] Detection settings reloaded from DB loaded")