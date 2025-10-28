from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from threading import Thread
import cv2
import time
import datetime
import logging
import config
import cctv_detection
import scheduler  

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

@app.route("/api/cctv_all", methods=["GET"])
def get_all_cctv():
    """Ambil semua CCTV, termasuk yang nonaktif."""
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
        last_log = 0
        while True:
            frame = config.annotated_frames.get(cctv_id)
            if frame is None:
                if time.time() - last_log > 2:
                    logging.warning(f"[CCTV {cctv_id}] Belum ada frame, tunggu proses deteksi...")
                    last_log = time.time()
                time.sleep(0.1)
                continue

            success, jpeg = cv2.imencode(".jpg", frame)
            if not success:
                time.sleep(0.05)
                continue

            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n")
            time.sleep(0.03)

    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/api/dashboard/summary_today", methods=["GET"])
def summary_today():
    from db.db_config import get_connection
    conn = get_connection()
    cur = conn.cursor(dictionary=True)

    today = datetime.date.today()

    # Ambil nama-nama violation aktif (no- class yang True)
    active_no_classes = [k for k, v in config.PPE_CLASSES.items() if v and k.startswith("no-")]
    if not active_no_classes:
        return jsonify({"error": "No active 'no-' violations."}), 400

    format_strings = ','.join(['%s'] * len(active_no_classes))

    query = f"""
        SELECT v.name AS violation_name, COALESCE(SUM(l.total_violation), 0) AS total
        FROM violation_daily_log l
        JOIN violation_data v ON v.id = l.id_violation
        WHERE l.log_date = %s AND v.name IN ({format_strings})
        GROUP BY v.name;
    """
    cur.execute(query, [today] + active_no_classes)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    # Buat dictionary lengkap agar yang tidak punya data muncul '-'
    result = {}
    for name in active_no_classes:
        value = next((r["total"] for r in rows if r["violation_name"] == name), None)
        result[name] = value if value and value > 0 else "-"

    return jsonify(result)

@app.route("/api/dashboard/top_cctv_today", methods=["GET"])
def top_cctv_today():
    from db.db_config import get_connection
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    today = datetime.date.today()

    # Ambil top 5 CCTV berdasarkan total pelanggaran
    cur.execute("""
        SELECT c.id, c.name AS cctv_name, c.location,
               SUM(l.total_violation) AS total_violations
        FROM violation_daily_log l
        JOIN cctv_data c ON c.id = l.id_cctv
        WHERE l.log_date = %s
        GROUP BY c.id
        ORDER BY total_violations DESC
        LIMIT 5;
    """, (today,))
    top_cctv = cur.fetchall()

    if not top_cctv:
        return jsonify([])

    cctv_ids = [row["id"] for row in top_cctv]
    format_strings = ','.join(['%s'] * len(cctv_ids))

    # Ambil breakdown per violation (no-* aktif)
    active_no_classes = [k for k, v in config.PPE_CLASSES.items() if v and k.startswith("no-")]
    format_no = ','.join(['%s'] * len(active_no_classes))

    query = f"""
        SELECT l.id_cctv, v.name AS violation_name, SUM(l.total_violation) AS total
        FROM violation_daily_log l
        JOIN violation_data v ON v.id = l.id_violation
        WHERE l.log_date = %s AND l.id_cctv IN ({format_strings}) AND v.name IN ({format_no})
        GROUP BY l.id_cctv, v.name;
    """
    cur.execute(query, [today] + cctv_ids + active_no_classes)
    breakdown = cur.fetchall()
    cur.close()
    conn.close()

    # Gabungkan hasil
    result = []
    for c in top_cctv:
        cctv_breakdown = [
            {"violation": b["violation_name"], "total": b["total"]}
            for b in breakdown if b["id_cctv"] == c["id"]
        ]
        result.append({
            "cctv_name": c["cctv_name"],
            "location": c["location"],
            "total_violations": c["total_violations"],
            "breakdown": cctv_breakdown
        })

    return jsonify(result)

@app.route("/api/dashboard/weekly_trend", methods=["GET"])
def weekly_trend():
    from db.db_config import get_connection
    conn = get_connection()
    cur = conn.cursor(dictionary=True)

    cur.execute("""
        SELECT log_date, SUM(total_violation) AS total
        FROM violation_daily_log
        WHERE log_date >= CURDATE() - INTERVAL 6 DAY
        GROUP BY log_date
        ORDER BY log_date;
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    # Lengkapi tanggal yang tidak ada data
    today = datetime.date.today()
    dates = [(today - datetime.timedelta(days=i)) for i in range(6, -1, -1)]
    result = []
    for d in dates:
        found = next((r["total"] for r in rows if r["log_date"] == d), 0)
        result.append({"date": d.strftime("%Y-%m-%d"), "total": found})

    return jsonify(result)

if __name__ == "__main__":
    config.annotated_frames = {}

    # Jalankan deteksi multi-CCTV
    threads = cctv_detection.start_all_detections()
    logging.info(f"Started {len(threads)} CCTV threads.")

    # Jalankan scheduler otomatis (rekap & pembersihan)
    Thread(target=scheduler.scheduler_thread, daemon=True).start()
    logging.info("Scheduler thread started (daily log + cleanup).")

    # Jalankan Flask server
    app.run(host="0.0.0.0", port=5000, threaded=True)
