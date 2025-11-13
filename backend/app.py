import numpy as np
import cv2
import time
import datetime
import logging
import config
import cctv_detection
import scheduler  
import backend.routes.cctv_crud as cctv_crud
import backend.routes.user_crud as user_crud
import sys

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from threading import Thread
from psycopg2.extras import RealDictCursor 
from db.db_config import get_connection

app = Flask(__name__)
CORS(app)
# Ubah level logging dari ERROR ke INFO agar pesan logging.info() juga terlihat
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")  

@app.route("/api/cctv_all", methods=["GET"])
def get_all_cctv():
    conn = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    # cursor.execute("SELECT id, name, ip_address, location, enabled FROM cctv_data;")
    cursor.execute("SELECT * FROM cctv_data ORDER BY id ASC;")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)

@app.route("/api/video_feed")
def video_feed():
    cctv_id = int(request.args.get("id", 1))

    def gen():
        last_frame_time = time.time()
        placeholder_frame = np.zeros((480, 640, 3), dtype=np.uint8)  # Placeholder hitam
        cv2.putText(placeholder_frame, "Stream disconnected", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        while True:
            frame = config.annotated_frames.get(cctv_id)
            if frame is None or time.time() - last_frame_time > 5:  # Freeze >5s
                frame = placeholder_frame
                logging.warning(f"[CCTV {cctv_id}] Using placeholder (freeze detected).")
            else:
                last_frame_time = time.time()
            success, jpeg = cv2.imencode(".jpg", frame)
            if not success:
                time.sleep(0.05)
                continue
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n")
            time.sleep(0.03)

    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route('/api/dashboard/summary_today')
def summary_today():
    """
    1. Menunjukkan total pelanggaran (SUM(total_violation)) berdasarkan jenis violation (id_violation)
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        # FIX: Menggunakan cursor_factory untuk psycopg2
        cursor = conn.cursor(cursor_factory=RealDictCursor) 
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        logging.info(f"Querying summary for {today}")
        
        # Ambil semua jenis violation dari object_class sebagai baseline
        cursor.execute("""
            SELECT o.name
            FROM object_class o
            WHERE o.is_violation = TRUE
        """)
        all_violations = {row['name']: None for row in cursor.fetchall()}
        
        # Hitung data untuk hari ini
        cursor.execute("""
            SELECT o.name, COALESCE(SUM(vdl.total_violation), 0) as count
            FROM object_class o
            LEFT JOIN violation_daily_log vdl 
                ON vdl.id_violation = o.id 
                AND vdl.log_date = CURRENT_DATE
            WHERE o.is_violation = TRUE
            GROUP BY o.name;
        """)
        
        result = cursor.fetchall()
        
        # Gabungkan hasil (count) ke dalam template (all_violations)
        counted_map = {r['name']: str(r['count']) for r in result}
        
        summary = {name: counted_map.get(name, "-") for name in all_violations.keys()}
        
        # logging.info(f"Summary result: {summary}")
        return jsonify(summary)
    
    except Exception as e:
        logging.error(f"Error in summary_today: {str(e)}")
        return jsonify({"error": "Internal Server Error"}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.route('/api/dashboard/top_cctv_today')
def top_cctv_today():
    """
    Dashboard: menampilkan Top 5 CCTV berdasarkan total pelanggaran hari ini,
    lengkap dengan breakdown per jenis pelanggaran.
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        today = datetime.datetime.now().strftime('%Y-%m-%d')
        logging.info(f"Querying top CCTV for {today}")

        # 1. Ambil ID top 5 CCTV berdasarkan total pelanggaran hari ini
        cursor.execute("""
            SELECT cd.id
            FROM cctv_data cd
            JOIN violation_daily_log vdl ON vdl.id_cctv = cd.id
            WHERE vdl.log_date = CURRENT_DATE
            GROUP BY cd.id
            ORDER BY SUM(vdl.total_violation) DESC
            LIMIT 5
        """)
        top_cctv_rows = cursor.fetchall()

        # Pastikan hasil tidak kosong
        if not top_cctv_rows:
            logging.info("Tidak ada CCTV dengan pelanggaran hari ini.")
            return jsonify([])

        top_cctv_ids = [r["id"] for r in top_cctv_rows]
        # logging.info(f"Top CCTV IDs: {top_cctv_ids}")

        # 2. Ambil data detail setiap CCTV
        # Gunakan ANY() agar Postgres menerima array integer
        query = """
            SELECT 
                cd.id,
                cd.name,
                cd.location,
                oc.name AS violation_name,
                COALESCE(SUM(vdl.total_violation), 0) AS count_per_type
            FROM cctv_data cd
            CROSS JOIN object_class oc
            LEFT JOIN violation_daily_log vdl 
                ON vdl.id_cctv = cd.id 
                AND vdl.id_violation = oc.id
                AND vdl.log_date = CURRENT_DATE
            WHERE cd.id = ANY(%s)
              AND oc.is_violation = TRUE
            GROUP BY cd.id, cd.name, cd.location, oc.name
            ORDER BY cd.id, oc.name;
        """

        # 🔧 Eksekusi query dengan parameter array
        cursor.execute(query, (top_cctv_ids,))
        raw_results = cursor.fetchall()

        if not raw_results:
            logging.warning("Query returned no results.")
            return jsonify([])

        # 3. Transformasi hasil ke struktur JSON per CCTV
        final_result = {}
        for row in raw_results:
            cctv_id = row["id"]
            if cctv_id not in final_result:
                final_result[cctv_id] = {
                    "id": cctv_id,
                    "name": row["name"],
                    "location": row["location"],
                    "total": 0,
                    "breakdown": []
                }

            final_result[cctv_id]["breakdown"].append({
                "violation": row["violation_name"],
                "total": row["count_per_type"]
            })
            final_result[cctv_id]["total"] += row["count_per_type"]

        # 4. Urutkan berdasarkan total pelanggaran tertinggi
        sorted_result = sorted(final_result.values(), key=lambda x: x["total"], reverse=True)

        # logging.info(f"Top CCTV result: {sorted_result}")
        return jsonify(sorted_result)

    except Exception as e:
        logging.exception(f"Error in top_cctv_today: {e}")
        return jsonify({"error": "Internal Server Error"}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route('/api/dashboard/weekly_trend')
def weekly_trend():
    """
    3. Menunjukkan total violation (SUM(total_violation)) selama 7 hari terakhir.
    Menggunakan TO_CHAR untuk memaksa format tanggal yang konsisten dengan frontend.
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        logging.info("Querying weekly trend for last 7 days")
        
        # Kueri untuk mendapatkan 7 hari terakhir dan total pelanggaran
        cursor.execute("""
            SELECT 
                -- Gunakan TO_CHAR untuk memastikan format string tanggal yang konsisten
                TO_CHAR(gs::date, 'Dy, DD Mon YYYY 00:00:00') AS date,
                COALESCE(SUM(vdl.total_violation), 0) AS value
            FROM generate_series(CURRENT_DATE - INTERVAL '6 day', CURRENT_DATE, '1 day') gs
            LEFT JOIN violation_daily_log vdl 
                ON vdl.log_date = gs::date
            GROUP BY gs
            ORDER BY gs;
        """)

        result = cursor.fetchall() or []
        
        # Mengubah value dari integer/float menjadi string (agar sama dengan format API sebelumnya)
        # Serta memastikan kunci 'date' memiliki timezone GMT di akhir string
        formatted_result = []
        for row in result:
            formatted_result.append({
                # Pastikan format GMT yang dibutuhkan frontend tetap ada
                'date': f"{row['date']} GMT", 
                'value': str(row['value'])
            })
            
        # logging.info(f"Weekly trend result: {formatted_result}")
        return jsonify(formatted_result)
        
    except Exception as e:
        # Menangani kesalahan kueri dengan lebih baik
        last_query = cursor.query.decode('utf-8') if cursor and hasattr(cursor, 'query') else 'N/A'
        logging.error(f"Weekly trend error: {str(e)} - Query: {last_query}")
        return jsonify({"error": str(e)}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.route('/api/object_classes', methods=['GET'])
def get_object_classes():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT id, name, color_r, color_g, color_b, is_violation FROM object_class")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(rows)

@app.route('/api/cctv_violations/<int:cctv_id>', methods=['GET', 'POST'])
def cctv_violations(cctv_id):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if request.method == 'GET':
        cur.execute("""
            SELECT class_id
            FROM cctv_violation_config
            WHERE cctv_id = %s AND is_active = TRUE
        """, (cctv_id,))
        rows = cur.fetchall()
        result = [row['class_id'] for row in rows]
        cur.close()
        conn.close()
        return jsonify(result)

    data = request.json.get('enabled_class_ids', [])
    logging.info(f"[POST] /api/cctv_violations/{cctv_id} enabled_class_ids={data}")
    logging.info(f"===> REQUEST RECEIVED for CCTV {cctv_id}: {data}")
    sys.stdout.flush()

    try:
        # Upsert aktif
        for class_id in data:
            cur.execute("""
                INSERT INTO cctv_violation_config (cctv_id, class_id, is_active)
                VALUES (%s, %s, TRUE)
                ON CONFLICT (cctv_id, class_id)
                DO UPDATE SET is_active = TRUE
            """, (cctv_id, class_id))

        # Nonaktifkan yang tidak dipilih
        if data:
            cur.execute("""
                UPDATE cctv_violation_config
                SET is_active = FALSE
                WHERE cctv_id = %s AND NOT (class_id = ANY(%s))
            """, (cctv_id, data))
        else:
            cur.execute("""
                UPDATE cctv_violation_config
                SET is_active = FALSE
                WHERE cctv_id = %s
            """, (cctv_id,))

        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        logging.error(f"[POST ERROR] /api/cctv_violations/{cctv_id}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/refresh_config', methods=['POST'])
def refresh_config():
    import config
    config.refresh_active_violations()
    return jsonify({"success": True})

@app.route('/api/reports', methods=['GET'])
def get_reports():
    conn = None
    cur = None
    try:
        # Ambil parameter dari request
        search_query = request.args.get('search', '')
        sort_order = request.args.get('sort', 'desc').upper()  
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        
        # Validasi parameter
        if sort_order not in ('ASC', 'DESC'): sort_order = 'DESC'
        if page < 1: page = 1
        if limit not in (10, 25, 50): limit = 10
            
        offset = (page - 1) * limit
        
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # --- Base Query dengan JOIN ---
        base_query = """
            FROM violation_detection vd
            JOIN cctv_data cd ON vd.id_cctv = cd.id
            JOIN object_class oc ON vd.id_violation = oc.id
            WHERE 1=1
        """
        
        # --- List Parameter dan Kondisi ---
        where_conditions = []
        query_params = []

        # 1. Search Filter (berdasarkan Nama CCTV)
        if search_query:
            where_conditions.append("cd.name ILIKE %s")
            query_params.append(f"%{search_query}%")
        
        # Gabungkan semua kondisi WHERE
        where_clause = "AND " + " AND ".join(where_conditions) if where_conditions else ""
            
        # --- 2. Query Total Item (untuk Pagination) ---
        count_query = f"SELECT COUNT(*) AS total {base_query} {where_clause}"
        cur.execute(count_query, query_params)
        total_items = cur.fetchone()['total']
        
        # --- 3. Query Data Laporan ---
        # NOTE: vd.image sudah berisi URL penuh dari Supabase Storage
        data_query = f"""
            SELECT
                vd.id,
                cd.name AS cctv_name,
                oc.name AS violation_name,
                vd.image AS image_path,  
                vd.timestamp
            {base_query}
            {where_clause}
            ORDER BY
                vd.timestamp {sort_order}
            LIMIT %s OFFSET %s
        """
        
        data_params = query_params + [limit, offset]
        cur.execute(data_query, data_params)
        reports = cur.fetchall()

        # --- Format data akhir dan Generate Signed URL ---
        final_reports = []
        BUCKET_NAME = config.SUPABASE_BUCKET

        for report in reports:
            signed_url = report['image_path'] 
            
            # Cek jika URL adalah URL Supabase yang valid (bukan error atau null)
            if report['image_path'] and 'supabase.co' in report['image_path']:
                try:
                    # Ambil PATH RELATIF: Potong bagian host/bucket dari URL penuh
                    path_parts = report['image_path'].split(f'/public/{BUCKET_NAME}/')
                    if len(path_parts) > 1:
                        relative_path = path_parts[1]
                        
                        signed_data = config.supabase.storage.from_(BUCKET_NAME).create_signed_url(relative_path, 3600)
                        signed_url = signed_data['signedUrl']
                    else:
                        logging.warning(f"Could not parse relative path for signed URL: {report['image_path']}")

                except Exception as sign_err:
                    logging.error(f"[SUPABASE SIGN ERROR]: {sign_err}")
                    # Jika gagal sign, gunakan URL mentah (hanya akan berfungsi jika bucket public)
                    signed_url = report['image_path']
            
            final_reports.append({
                'id': report['id'],
                'cctv_name': report['cctv_name'],
                'violation_name': report['violation_name'],
                'timestamp': report['timestamp'].isoformat() if report['timestamp'] else None,
                'image_url': signed_url,
            })
            
        return jsonify({
            "reports": final_reports,
            "totalItems": total_items,
            "currentPage": page,
            "itemsPerPage": limit
        }), 200

    except Exception as e:
        logging.error(f"[REPORTS API ERROR]: {e}")
        return jsonify({"error": "Failed to retrieve reports data."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# --- API UNTUK MANAJEMEN USER DENGAN MAPPING CCTV ---
@app.route('/api/users_with_cctvs', methods=['GET'])
def get_users_with_cctvs():
    conn = None
    cur = None
    try:
        # Ambil parameter dari request
        search_query = request.args.get('search', '')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        
        # Validasi parameter
        if page < 1: page = 1
        # Set limit tetap 10 jika tidak valid
        if limit not in (10, 25, 50): limit = 10 
            
        offset = (page - 1) * limit
        
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1. Tentukan CTE untuk Filtering (Ini menggantikan search_filter_query)
        # filtered_user_ids akan berisi daftar ID user yang cocok dengan search_query
        cte_query = """
            WITH filtered_user_ids AS (
                SELECT DISTINCT u.id
                FROM users u
                LEFT JOIN user_cctv_map ucm ON u.id = ucm.user_id
                LEFT JOIN cctv_data cd ON ucm.cctv_id = cd.id
                WHERE 1=1 
        """
        search_params = []
        if search_query:
            search_term = f"%{search_query}%"
            # Pencarian di Name, Email, Nama CCTV, atau Lokasi CCTV
            cte_query += """
                AND (
                    u.full_name ILIKE %s OR 
                    u.email ILIKE %s OR 
                    cd.name ILIKE %s OR
                    cd.location ILIKE %s
                )
            """
            # Empat parameter untuk empat %s
            search_params.extend([search_term, search_term, search_term, search_term])
        
        cte_query += ")" # Penutup CTE

        
        # 2. Query Total Item (untuk Pagination) menggunakan CTE
        # Jumlah parameter: Sama dengan search_params
        count_query = cte_query + " SELECT COUNT(id) AS total FROM filtered_user_ids"
        
        cur.execute(count_query, search_params) # Eksekusi dengan parameter pencarian
        total_items = cur.fetchone()['total']
        
        # 3. Query Data User dengan Aggregasi CCTV menggunakan CTE
        # Jumlah parameter: Sama dengan search_params + [limit, offset]
        data_query = cte_query + """
            SELECT
                u.id,
                u.username, 
                u.full_name,
                u.email,
                u.role,
                -- Aggregasi data CCTV yang diampu menjadi array JSON
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT('id', cd.id, 'name', cd.name, 'location', cd.location)
                        ORDER BY cd.id
                    ) FILTER (WHERE cd.id IS NOT NULL), 
                    '[]'::json
                ) AS cctvs
            FROM users u
            INNER JOIN filtered_user_ids fuid ON u.id = fuid.id -- Filter hanya ID yang ada di CTE
            LEFT JOIN user_cctv_map ucm ON u.id = ucm.user_id
            LEFT JOIN cctv_data cd ON ucm.cctv_id = cd.id
            GROUP BY u.id, u.full_name, u.email, u.role
            ORDER BY u.full_name ASC
            LIMIT %s OFFSET %s
        """
        
        # Parameter untuk data_query: (parameter pencarian) + (limit) + (offset)
        data_params = search_params + [limit, offset] 
        
        cur.execute(data_query, data_params)
        users = cur.fetchall()

        return jsonify({
            "users": users,
            "totalItems": total_items,
            "currentPage": page,
            "itemsPerPage": limit
        }), 200

    except Exception as e:
        # PENTING: Log detail error (f-string) agar bisa di-debug di server
        logging.error(f"[USER API ERROR]: {e}")
        return jsonify({"error": f"Failed to retrieve user data. Detail: {e}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

if __name__ == "__main__":
    config.annotated_frames = {}

    # Jalankan deteksi multi-CCTV
    threads = cctv_detection.start_all_detections()
    logging.info(f"Started {len(threads)} CCTV threads.")

    config.refresh_active_violations()

    # Jalankan scheduler otomatis (rekap & pembersihan)
    Thread(target=scheduler.scheduler_thread, daemon=True).start()
    logging.info("Scheduler thread started (daily log + cleanup).")

    app.register_blueprint(cctv_crud.cctv_bp)
    app.register_blueprint(user_crud.user_bp)

    # Jalankan Flask server
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=False)
