import numpy as np
import cv2
import time
import datetime
import logging
import config
import cctv_detection
import scheduler  
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
    cursor.execute("SELECT id, name, ip_address, location, enabled FROM cctv_data;")
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
        
        logging.info(f"Summary result: {summary}")
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
        logging.info(f"Top CCTV IDs: {top_cctv_ids}")

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

        logging.info(f"Top CCTV result: {sorted_result}")
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
            
        logging.info(f"Weekly trend result: {formatted_result}")
        return jsonify(formatted_result)
        
    except Exception as e:
        # Menangani kesalahan kueri dengan lebih baik
        last_query = cursor.query.decode('utf-8') if cursor and hasattr(cursor, 'query') else 'N/A'
        logging.error(f"Weekly trend error: {str(e)} - Query: {last_query}")
        return jsonify({"error": str(e)}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

# Tambah API untuk object_class jika perlu
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

if __name__ == "__main__":
    config.annotated_frames = {}

    # Jalankan deteksi multi-CCTV
    threads = cctv_detection.start_all_detections()
    logging.info(f"Started {len(threads)} CCTV threads.")

    # Jalankan scheduler otomatis (rekap & pembersihan)
    Thread(target=scheduler.scheduler_thread, daemon=True).start()
    logging.info("Scheduler thread started (daily log + cleanup).")

    # Jalankan Flask server
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=True)
