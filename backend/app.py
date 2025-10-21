from flask import Flask, Response
from flask_cors import CORS
import threading
import cv2
import logging
import time
import cctv_detection
import config

app = Flask(__name__)
CORS(app)  # Tambah ini untuk handle CORS
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

@app.route('/')
def index():
    return """
    <html>
    <body style="text-align: center;">
        <h1>CCTV Monitoring Portal</h1>
        <img src="/video_feed" style="max-width: 75%; height: auto; border: 2px solid #000;" />
        <p>Minimal 3 FPS realtime stream</p>
    </body>
    </html>
    """

@app.route('/video_feed')
def video_feed():
    def gen():
        while True:
            with cctv_detection.frame_lock:
                frame = cctv_detection.annotated_frame
                if frame is None:
                    time.sleep(0.05)
                    continue
                frame_copy = frame.copy()

            try:
                max_w = getattr(config, 'WEB_MAX_WIDTH', None)
                if max_w is not None:
                    h, w = frame_copy.shape[:2]
                    if w > max_w:
                        scale = max_w / float(w)
                        new_w = int(w * scale)
                        new_h = int(h * scale)
                        frame_web = cv2.resize(frame_copy, (new_w, new_h), interpolation=cv2.INTER_AREA)
                    else:
                        frame_web = frame_copy
                else:
                    frame_web = frame_copy
                ret, jpeg = cv2.imencode('.jpg', frame_web)
            except Exception:
                ret, jpeg = cv2.imencode('.jpg', frame_copy)
            if not ret:
                continue

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' +
                   jpeg.tobytes() +
                   b'\r\n\r\n')

            time.sleep(0.005)

    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == "__main__":
    t = threading.Thread(target=cctv_detection.start_detection, daemon=True)
    t.start()
    app.run(host='0.0.0.0', port=5000, threaded=True)