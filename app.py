# app.py
from flask import Flask, Response
import time
import cv2
import logging
import numpy as np

from cctv_detection import annotated_frame, frame_lock, start_detection

app = Flask(__name__)

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

@app.route('/')
def index():
    logging.info("Serving index page")
    return """
    <html>
    <body style="text-align: center;">
        <h1>CCTV Monitoring Portal</h1>
        <img src="/video_feed" style="max-width: 90%; height: auto; border: 2px solid #000;" />
        <br/>
        <p>Access this portal at http://localhost:5000. Press Ctrl+C to stop. Last updated: 13 Oct 2025.</p>
    </body>
    </html>
    """

@app.route('/video_feed')
def video_feed():
    def gen():
        while True:
            with frame_lock:
                if annotated_frame is not None:
                    logging.debug(f"Encoding frame with shape: {annotated_frame.shape}, sum: {np.sum(annotated_frame)}")
                    ret, jpeg = cv2.imencode('.jpg', annotated_frame)
                    if ret:
                        yield (b'--frame\r\n'
                                b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
                    else:
                        logging.error("Failed to encode frame")
            time.sleep(0.2)  # Turunkan untuk lebih realtime
    logging.info("Starting video feed")
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == "__main__":
    logging.info("Starting Flask server")
    start_detection()
    app.run(host='0.0.0.0', port=5000, threaded=True)