from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import time
import logging
import cctv_detection
import config

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

if __name__ == "__main__":
    config.annotated_frames = {}
    threads = cctv_detection.start_all_detections()
    logging.info(f"Started {len(threads)} CCTV threads.")
    app.run(host="0.0.0.0", port=5000, threaded=True)
