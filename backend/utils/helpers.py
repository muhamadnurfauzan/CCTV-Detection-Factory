# backend/utils/geometry.py
from db.db_config import get_connection
from shared_state import state

# --- FUNGSI MEMBACA POLYGON ROI JSON ---
def point_in_polygon(point, polygon):
    """Return True if point is inside polygon."""
    x, y = point
    inside = False
    n = len(polygon)
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y) and x <= max(p1x, p2x):
                if p1y != p2y:
                    xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                if p1x == p2x or x <= xinters:
                    inside = not inside
        p1x, p1y = p2x, p2y
    return inside

# --- FUNGSI GENERIK UNTUK MERESET POSTGRESQL SEQUENCE ---
def reset_table_sequence(table_name):
    """
    Memastikan auto-increment ID tabel (SERIAL) dimulai setelah nilai MAX(id) yang ada.
    Dijalankan sekali saat aplikasi startup untuk menghindari masalah duplicate key setelah migrasi data.
    """
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # Nama sequence di PostgreSQL adalah <nama_tabel>_<nama_kolom>_seq
        sequence_name = f"{table_name}_id_seq" 

        # Kueri setval(nama_sequence, max_id, true)
        # COALESCE(MAX(id), 1) memastikan setidaknya mulai dari 1 jika tabel kosong
        cur.execute(f"""
            SELECT setval('{sequence_name}', COALESCE(MAX(id), 1), true) 
            FROM {table_name};
        """)
        new_val = cur.fetchone()[0]
        conn.commit()
        return True
    except Exception as e:
        # Pengecualian: sequence mungkin tidak ada jika tabel tidak punya SERIAL id
        print(f"[DB INIT] Gagal me-reset sequence ID untuk {table_name}: {e}")
        return False
    finally:
        if cur: cur.close()
        if conn: conn.close()

# Fungsi helper untuk color
def get_color_for_class(class_name):
    return state.OBJECT_CLASS_CACHE.get(class_name, {}).get("color", (255, 255, 255))