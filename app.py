from flask import Flask, Response
import time
import threading
import queue
import cv2
import numpy as np

from config import VIDEO_PATH, QUEUE_SIZE
from detection import annotated_frame, frame_lock, capture_thread, process_thread

app = Flask(__name__)

# Jalankan thread capture dan process di level modul untuk Gunicorn
frame_queue = queue.Queue(maxsize=QUEUE_SIZE)
capture_t = threading.Thread(target=capture_thread, args=(frame_queue, VIDEO_PATH))
process_t = threading.Thread(target=process_thread, args=(frame_queue,))
capture_t.start()
process_t.start()

@app.route('/')
def index():
    return """
    <html>
    <body style="text-align: center;">
        <h1>CCTV Monitoring Portal</h1>
        <img src="/video_feed" style="max-width: 90%; height: auto; border: 2px solid #000;" />
        <br/>
        <p>Access this portal at http://localhost:5000. Press Ctrl+C to stop. Last updated: 14 Oct 2025.</p>
    </body>
    </html>
    """

@app.route('/video_feed')
def video_feed():
    def gen():
        while True:
            acquired = frame_lock.acquire(timeout=1.0)
            try:
                if acquired:
                    if annotated_frame is not None:
                        ret, jpeg = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                        if ret:
                            yield (b'--frame\r\n'
                                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
                    else:
                        default_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                        cv2.putText(default_frame, "Loading CCTV Stream...", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                        ret, jpeg = cv2.imencode('.jpg', default_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                        if ret:
                            yield (b'--frame\r\n'
                                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
            finally:
                if acquired:
                    frame_lock.release()
            time.sleep(0.1)  # Kurangi ke 0.1 detik untuk yield cepat
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, threaded=False)