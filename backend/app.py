import numpy as np
import cv2
import time
import datetime
import logging
import config
import cctv_detection
import scheduler  

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from threading import Thread
# RealDictCursor adalah ekuivalen dari dictionary=True untuk psycopg2
from psycopg2.extras import RealDictCursor 

app = Flask(__name__)
CORS(app)
# Ubah level logging dari ERROR ke INFO agar pesan logging.info() juga terlihat
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")  

@app.route("/api/cctv_all", methods=["GET"])
def get_all_cctv():
    from db.db_config import get_connection
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
        from db.db_config import get_connection
        conn = get_connection()
        # FIX: Menggunakan cursor_factory untuk psycopg2
        cursor = conn.cursor(cursor_factory=RealDictCursor) 
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        logging.info(f"Querying summary for {today}")
        
        # Ambil semua jenis violation dari violation_data sebagai baseline
        cursor.execute("""
            SELECT v.name
            FROM violation_data v
            WHERE v.name LIKE 'no-%'
        """)
        all_violations = {row['name']: None for row in cursor.fetchall()}
        
        # Hitung data untuk hari ini
        cursor.execute("""
            SELECT v.name, COALESCE(SUM(vdl.total_violation), 0) as count
            FROM violation_data v
            LEFT JOIN violation_daily_log vdl 
                ON vdl.id_violation = v.id 
                AND vdl.log_date = CURRENT_DATE
            WHERE v.name LIKE 'no-%'
            GROUP BY v.name;
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
    2. Menunjukkan top 5 kamera CCTV dan total pelanggaran per jenis (combo bar chart).
    """
    conn = None
    cursor = None
    try:
        from db.db_config import get_connection
        conn = get_connection()
        # FIX: Menggunakan cursor_factory untuk psycopg2
        cursor = conn.cursor(cursor_factory=RealDictCursor) 
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        logging.info(f"Querying top CCTV for {today}")

        # Dapatkan semua nama violation (keys)
        cursor.execute("""
            SELECT name
            FROM violation_data 
            WHERE name LIKE 'no-%'
            ORDER BY id
        """)
        
        # Step 1: Hitung Total semua violation per CCTV untuk hari ini, dan ambil Top 5 CCTV ID
        # MENGHILANGKAN %s dan MENGGUNAKAN CURRENT_DATE
        cursor.execute("""
            SELECT cd.id
            FROM cctv_data cd
            JOIN violation_daily_log vdl ON vdl.id_cctv = cd.id
            WHERE vdl.log_date = CURRENT_DATE
            GROUP BY cd.id
            ORDER BY SUM(vdl.total_violation) DESC
            LIMIT 5
        """)
        
        # Menggunakan LIST. Jika kosong, akan dikembalikan [] di bawah.
        top_cctv_ids = [row['id'] for row in cursor.fetchall()]
        
        if not top_cctv_ids:
            return jsonify([]) # Tidak ada data hari ini
            
        # Step 2: Ambil semua data cctv_data dan violation_daily_log untuk 5 CCTV teratas
        
        # PERBAIKAN KRUSIAL: 
        # Mengganti IN %s menjadi WHERE cd.id = ANY(%s) untuk menghindari isu parameterisasi tuple/list
        query = """
            SELECT 
                cd.id,
                cd.name,
                cd.location,
                vd.name AS violation_name,
                COALESCE(SUM(vdl.total_violation), 0) AS count_per_type
            FROM cctv_data cd
            CROSS JOIN violation_data vd 
            LEFT JOIN violation_daily_log vdl 
                ON vdl.id_cctv = cd.id 
                AND vdl.id_violation = vd.id
                AND vdl.log_date = CURRENT_DATE  -- Menggunakan CURRENT_DATE
            WHERE cd.id = ANY(%s)               -- Menggunakan ANY() untuk array ID
            AND vd.name LIKE 'no-%'
            GROUP BY cd.id, cd.name, cd.location, vd.name
            ORDER BY cd.id, vd.name;
        """
        
        # Parameter eksekusi: HANYA LIST ID CCTV, DIBUNGKUS DALAM TUPLE
        # Psycopg2 akan secara otomatis mengkonversi list/tuple Python menjadi array Postgres.
        params = (top_cctv_ids,) 
        
        # DEBUG: Menambahkan logging untuk parameter yang dikirim
        logging.info(f"Top CCTV IDs: {top_cctv_ids}")
        logging.info(f"Executing query with params: {params}")

        cursor.execute(query, params)

        raw_results = cursor.fetchall()

        # 3. Transformasi data untuk frontend (Menggabungkan baris menjadi objek CCTV)
        final_result = {}
        for row in raw_results:
            cctv_id = row['id']
            v_name = row['violation_name']
            v_count = row['count_per_type']
            
            if cctv_id not in final_result:
                final_result[cctv_id] = {
                    'id': cctv_id,
                    'name': row['name'],
                    'location': row['location'],
                    'total': 0,
                }
            
            # Tambahkan hitungan per jenis
            final_result[cctv_id][v_name] = v_count
            
            # Hitung total keseluruhan
            final_result[cctv_id]['total'] += v_count

        result = list(final_result.values())
        
        # Sortir lagi berdasarkan total sebelum dikirim, untuk jaga-jaga
        result.sort(key=lambda x: x['total'], reverse=True)
        
        logging.info(f"Top CCTV result: {result}")
        return jsonify(result)
        
    except Exception as e:
        # Menambahkan pesan error yang lebih informatif untuk debugging
        logging.error(f"Error in top_cctv_today: {str(e)}")
        # Optional: Print the failed query and parameters for internal debugging
        # if cursor:
        #     logging.error(f"Failed Query: {query}")
        #     logging.error(f"Failed Params: {params}")
        return jsonify({"error": "Internal Server Error"}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.route('/api/dashboard/weekly_trend')
def weekly_trend():
    """
    3. Menunjukkan total violation (SUM(total_violation)) selama 7 hari terakhir.
    Menggunakan TO_CHAR untuk memaksa format tanggal yang konsisten dengan frontend.
    """
    conn = None
    cursor = None
    try:
        from db.db_config import get_connection
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
