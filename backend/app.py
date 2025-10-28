from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from threading import Thread
import numpy as np
import cv2
import time
import datetime
import logging
import config
import cctv_detection
import scheduler  

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.ERROR, format="%(asctime)s - %(levelname)s - %(message)s")  # Ubah ke ERROR

@app.route("/api/cctv_all", methods=["GET"])
def get_all_cctv():
    from db.db_config import get_connection
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
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
    from db.db_config import get_connection
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
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
        SELECT v.name, COALESCE(COUNT(vdl.id_violation), 0) as count
        FROM violation_data v
        LEFT JOIN violation_daily_log vdl ON vdl.id_violation = v.id AND vdl.log_date = %s
        WHERE v.name LIKE 'no-%'
        GROUP BY v.name
    """, (today,))
    result = cursor.fetchall() or []
    
    # Gabungkan semua violation dengan count (0 jadi "-")
    summary = {v: (str(r['count']) if r else "-") for v in all_violations for r in [next((r for r in result if r['name'] == v), None)]}
    logging.info(f"Summary result: {summary}")
    cursor.close()
    conn.close()
    return jsonify(summary)

@app.route('/api/dashboard/top_cctv_today')
def top_cctv_today():
    from db.db_config import get_connection
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    today = datetime.datetime.now().strftime('%Y-%m-%d')
    logging.info(f"Querying top CCTV for {today}")
    cursor.execute("""
        SELECT cd.id, cd.name, cd.location, COUNT(vdl.id_violation) as total
        FROM cctv_data cd
        LEFT JOIN violation_daily_log vdl ON vdl.id_cctv = cd.id AND DATE(vdl.log_date) = %s
        GROUP BY cd.id, cd.name, cd.location
        ORDER BY total DESC
        LIMIT 5
    """, (today,))
    result = cursor.fetchall()
    logging.info(f"Top CCTV result: {result}")
    cursor.close()
    conn.close()
    return jsonify(result)

@app.route('/api/dashboard/weekly_trend')
def weekly_trend():
    from db.db_config import get_connection
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        logging.info("Querying weekly trend for last 7 days")
        cursor.execute("""
            SELECT DATE(DATE_SUB(CURRENT_DATE, INTERVAL (6 - a.a) DAY)) as date, 
                   COALESCE(COUNT(vdl.id_violation), 0) as value
            FROM (SELECT 0 as a UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) a
            LEFT JOIN violation_daily_log vdl ON vdl.log_date = DATE(DATE_SUB(CURRENT_DATE, INTERVAL (6 - a.a) DAY))
            GROUP BY DATE(DATE_SUB(CURRENT_DATE, INTERVAL (6 - a.a) DAY))
            ORDER BY date
        """)
        result = cursor.fetchall() or []
        logging.info(f"Weekly trend result: {result}")
        cursor.close()
        conn.close()
        return jsonify(result)
    except Exception as e:
        logging.error(f"Weekly trend error: {str(e)} - Query: {cursor._last_executed if 'cursor' in locals() else 'N/A'}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    config.annotated_frames = {}

    # Jalankan deteksi multi-CCTV
    threads = cctv_detection.start_all_detections()
    logging.info(f"Started {len(threads)} CCTV threads.")

    # Jalankan scheduler otomatis (rekap & pembersihan)
    Thread(target=scheduler.scheduler_thread, daemon=True).start()
    logging.info("Scheduler thread started (daily log + cleanup).")

    # Jalankan Flask server
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=True)  # Tambah debug=True