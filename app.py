from flask import Flask, Response
from time import perf_counter, sleep
import threading
import cv2
import logging
import time
import datetime
import cctv_detection

app = Flask(__name__)
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
                    continue
                frame_copy = frame.copy()

            # resize & encode
            frame_web = cv2.resize(frame_copy, (1280, 768), interpolation=cv2.INTER_AREA)
            ret, jpeg = cv2.imencode('.jpg', frame_web)
            if not ret:
                continue

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' +
                   jpeg.tobytes() +
                   b'\r\n\r\n')

            # tidak perlu sleep lama, hanya kasih napas CPU
            time.sleep(0.005)

    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')



if __name__ == "__main__":
    t = threading.Thread(target=cctv_detection.start_detection, daemon=True)
    t.start()
    app.run(host='0.0.0.0', port=5000, threaded=True)
