
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
                print("[CACHE] WARNING: Object classes kosong dari DB!")
        except Exception as e:
            print(f"[CACHE] ERROR: Gagal load object_classes: {e}")

# --- Fetch jenis violation yang aktif dari CCTV secara custom ---
def get_active_violation_ids_for_cctv(cctv_id):
    if cctv_id in state.ACTIVE_VIOLATION_CACHE:
        return state.ACTIVE_VIOLATION_CACHE[cctv_id]
    else:
        # DB query sebagai fallback
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT oc.id 
            FROM cctv_violation_config cvc
            JOIN object_class oc ON cvc.class_id = oc.id
            WHERE cvc.cctv_id = %s AND cvc.is_active = true
        """, (cctv_id,))
        ids = [row[0] for row in cur.fetchall()]
        cur.close(); conn.close()
        state.ACTIVE_VIOLATION_CACHE[cctv_id] = ids  
        return ids
    
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

# --- Cache aktif violation per CCTV ---
def refresh_active_violations():
    """Refresh cache violation aktif dari DB. Gunakan context manager untuk auto-close."""
    state.ACTIVE_VIOLATION_CACHE.clear()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT cvc.cctv_id, oc.id
                    FROM cctv_violation_config cvc
                    JOIN object_class oc ON cvc.class_id = oc.id
                    WHERE cvc.is_active = true
                """)
                rows = cur.fetchall()  
                
        # Proses di luar context agar tidak blokir koneksi
        for cctv_id, class_id in rows:
            state.ACTIVE_VIOLATION_CACHE.setdefault(cctv_id, []).append(class_id)
            
        logging.info(f"[ACTIVE CACHE] Refreshed: {len(state.ACTIVE_VIOLATION_CACHE)} entries")
        
    except Exception as e:
        logging.error(f"[ACTIVE CACHE] FAILED to refresh: {e}")
        # Jangan biarkan cache kosong total jika error — fallback ke empty
        state.ACTIVE_VIOLATION_CACHE.clear()