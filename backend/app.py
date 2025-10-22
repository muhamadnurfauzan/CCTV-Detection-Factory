from flask import Flask, Response, send_from_directory
from flask_cors import CORS
import threading
import cv2
import logging
import time
import cctv_detection
import config
import subprocess as sp
import os

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Direktori untuk HLS segments
HLS_DIR = 'static/hls'
os.makedirs(HLS_DIR, exist_ok=True)

ffmpeg_proc = None

def start_hls_stream():
    global ffmpeg_proc
    width, height = config.CCTV_RATIO if config.CCTV_RATIO else (1280, 720)
    cmd = [
        'ffmpeg',
        '-y',
        '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'bgr24',
        '-s', f"{width}x{height}",
        '-r', '15',
        '-i', '-',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-crf', '23',
        '-g', '30',
        '-sc_threshold', '0',
        '-hls_time', '1',
        '-hls_list_size', '3',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', f'{HLS_DIR}/segment%d.ts',
        f'{HLS_DIR}/playlist.m3u8'
    ]
    try:
        ffmpeg_proc = sp.Popen(cmd, stdin=sp.PIPE, stderr=sp.PIPE, stdout=sp.PIPE)
        def log_ffmpeg_output():
            while True:
                line = ffmpeg_proc.stderr.readline().decode('utf-8', errors='replace')
                if not line:
                    break
        threading.Thread(target=log_ffmpeg_output, daemon=True).start()
    except Exception as e:
        logging.error(f"Failed to start FFmpeg: {e}")
        raise

def hls_generator():
    global ffmpeg_proc
    while True:
        with cctv_detection.frame_lock:
            frame = cctv_detection.annotated_frame
            if frame is None:
                time.sleep(0.05)
                continue
            frame_copy = frame.copy()
            target_width, target_height = config.CCTV_RATIO if config.CCTV_RATIO else (1280, 720)
            h, w = frame_copy.shape[:2]
            scale = target_width / float(w)
            frame_copy = cv2.resize(frame_copy, (target_width, int(h * scale)), interpolation=cv2.INTER_AREA)
            try:
                ffmpeg_proc.stdin.write(frame_copy.tobytes())
                ffmpeg_proc.stdin.flush()
            except Exception as e:
                logging.error(f"HLS pipe error: {e}")
                if ffmpeg_proc.poll() is not None:
                    logging.error("FFmpeg process died, restarting...")
                    start_hls_stream()
        time.sleep(1/15)

@app.route('/video_feed')
def video_feed():
    playlist_path = os.path.join(HLS_DIR, 'playlist.m3u8')
    timeout = 15  # Tingkatkan timeout menjadi 15 detik
    start_time = time.time()
    while not os.path.exists(playlist_path) and time.time() - start_time < timeout:
        time.sleep(0.5)
    if not os.path.exists(playlist_path):
        logging.error(f"Playlist file not found: {playlist_path}")
        return Response("HLS playlist not found. Check FFmpeg.", status=500)
    try:
        return send_from_directory(HLS_DIR, 'playlist.m3u8')
    except Exception as e:
        logging.error(f"Error serving playlist.m3u8: {e}")
        return Response("Error serving HLS playlist", status=500)

@app.route('/hls/<path:filename>')
def hls_segments(filename):
    try:
        return send_from_directory(HLS_DIR, filename)
    except Exception as e:
        return Response("Error serving HLS segment", status=500)

if __name__ == "__main__":
    try:
        t_hls = threading.Thread(target=start_hls_stream, daemon=True)
        t_hls.start()
        t_gen = threading.Thread(target=hls_generator, daemon=True)
        t_gen.start()
        t = threading.Thread(target=cctv_detection.start_detection, daemon=True)
        t.start()
        app.run(host='0.0.0.0', port=5000, threaded=True)
    except Exception as e:
        logging.error(f"Application failed to start: {e}")
        raise