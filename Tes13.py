# Windows + person detection dihapus, gunakan flask untuk webserver

import cv2
import os
import datetime
import time
import numpy as np
import json
from ultralytics import YOLO
import threading
import queue
import gc  # Untuk garbage collection
import torch  # Untuk clear cache
from flask import Flask, Response

app = Flask(__name__)

# Global untuk annotated_frame (untuk stream ke web)
annotated_frame = None
frame_lock = threading.Lock()  # Lock untuk akses aman antar thread

# --- Konfigurasi ---
VIDEO_PATH = "rtsps://192.168.199.9:7441/sKDBmnGEmed2VzuM?enableSrtp"  # CCTV URL
OUTPUT_DIR = "violations"
CONFIDENCE_THRESHOLD = 0.3  # Untuk PPE model
MODEL_PATH = "model/helm detection.pt"  # PPE model
COOLDOWN = 60  # Cooldown detik
CLEANUP_INTERVAL = 60  # Hapus track kalau hilang >60 detik
PADDING_PERCENT = 0.5  # Expand bounding box
TARGET_MAX_WIDTH = 320  # Resize untuk polaroid
LOCATION = "Plant A"
JSON_PATH = "JSON/cctv_area.json"
FRAME_SKIP = 15  # Naikkan untuk optimasi memori (proses setiap 10 frame)
RESIZE_SCALE = 0.9  # Turunkan untuk kurangi beban memori
QUEUE_SIZE = 5  # Kurangi max frame di queue

# --- Load ROI dari JSON ---
roi_regions = []
json_image_width = 0
json_image_height = 0

def load_roi_from_json(json_path):
    global roi_regions, json_image_width, json_image_height
    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
            json_image_width = data.get('image_width', 0)
            json_image_height = data.get('image_height', 0)
            for item in data.get('items', []):
                points = item['points']
                roi_regions.append({
                    'type': item['type'],
                    'points': np.array(points, dtype=np.float32)
                })
    except Exception as e:
        print(f"Gagal load JSON: {e}")
        exit()

load_roi_from_json(JSON_PATH)

# --- Kostumisasi Kelas PPE ---
PPE_CLASSES = {
    "helmet": True,
    "no-helmet": True,
    "vest": True,
    "no-vest": True,  
}

ppe_colors = {
    "no-helmet": (255, 0, 255),  # Magenta
    "helmet": (0, 255, 0),       # Hijau
    "no-vest": (255, 255, 0),   # Kuning
    "vest": (0, 255, 255),       # Cyan
}

# --- Setup ---
os.makedirs(OUTPUT_DIR, exist_ok=True)
try:
    model = YOLO(MODEL_PATH)
    model.half()  
except Exception as e:
    print(f"Gagal load model YOLO: {e}")
    exit()

tracked_violations = {}  # {track_id: {'violations': set(), 'last_times': {}, 'last_seen': time.time(), 'last_video_times': {}}}

# --- Fungsi Cek Point dalam Poligon ---
def point_in_polygon(point, polygon):
    x, y = point
    n = len(polygon)
    inside = False
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

# --- Fungsi untuk Membuka Stream ---
def open_stream():
    cap = cv2.VideoCapture(VIDEO_PATH, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
    
    if not cap.isOpened():
        print("Gagal RTSPS. Mencoba RTSP...")
        cap = cv2.VideoCapture("rtsp://192.168.199.9:7447/sKDBmnGEmed2VzuM", cv2.CAP_FFMPEG)
        if not cap.isOpened():
            print("Masih gagal RTSP. Minta URL valid ke mentor.")
            return None
    return cap

# --- Thread untuk Capture Frame ---
def capture_thread(frame_queue):
    cap = open_stream()
    if cap is None:
        return
    
    frame_count = 0
    scaled = False  # Flag untuk scaling ROI
    while True:
        try:
            ret, frame = cap.read()
            if not ret:
                print("Gagal membaca frame. Reconnect...")
                cap.release()
                cap = open_stream()
                if cap is None:
                    break
                continue
            frame_count += 1
            if frame_count % FRAME_SKIP != 0:
                continue
            frame = cv2.resize(frame, (0, 0), fx=RESIZE_SCALE, fy=RESIZE_SCALE)
            print(f"Queue diisi dengan frame {frame_count} pada {time.time()}")
            frame_queue.put((frame, time.time()))  # Put frame dan waktu
            
            if not scaled:
                video_height, video_width = frame.shape[:2]
                scale_x = video_width / json_image_width if json_image_width > 0 else 1.0
                scale_y = video_height / json_image_height if json_image_height > 0 else 1.0
                for region in roi_regions:
                    region['points'] = (region['points'] * np.array([scale_x, scale_y])).astype(np.int32)
                scaled = True
                print("ROI scaled setelah frame pertama dibaca.")
        except Exception as e:
            print(f"Error capture: {e}")
            cap.release()
            cap = open_stream()
            if cap is None:
                break

# --- Main Processing Thread ---
def process_thread(frame_queue):
    start_time = time.time()
    while True:
        try:
            frame, capture_time = frame_queue.get(timeout=1)
        except queue.Empty:
            continue
        
        current_real_time = time.time()
        video_time = capture_time - start_time  # Estimasi waktu berdasarkan capture
        
        # Pre-processing with error handling
        try:
            frame_enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)
        except Exception as e:
            print(f"Error preprocessing: {e}")
            continue
        
        # Persiapan annotated_frame untuk visualisasi (untuk web)
        annotated_frame_local = frame.copy()
        for region in roi_regions:
            if region['type'] == 'polygon':
                cv2.polylines(annotated_frame_local, [region['points']], isClosed=True, color=(0, 165, 255), thickness=2)
            elif region['type'] == 'line':
                cv2.line(annotated_frame_local, tuple(region['points'][0]), tuple(region['points'][1]), (0, 165, 255), 2)
        
        # Deteksi with error handling dan optimasi memori
        try:
            with torch.no_grad():  # Hemat memori inference
                # Hanya deteksi PPE langsung pada frame
                ppe_results = model.track(frame_enhanced, conf=CONFIDENCE_THRESHOLD, persist=True)
                for ppe_result in ppe_results:
                    for box in ppe_result.boxes:
                        if box.id is None:
                            continue
                        x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                        cls_id = int(box.cls.cpu().numpy()[0])
                        conf = float(box.conf.cpu().numpy()[0])
                        track_id = int(box.id.cpu().numpy()[0])
                        process_detection(frame, annotated_frame_local, x1, y1, x2, y2, cls_id, conf, track_id, current_real_time, video_time)
        except Exception as e:
            print(f"Error deteksi: {e}")
            continue
        
        # Update global annotated_frame untuk web stream
        with frame_lock:
            global annotated_frame
            annotated_frame = annotated_frame_local
        
        # Cleanup memori
        del frame_enhanced  
        gc.collect()  
        
        # Cleanup tracked_violations
        if current_real_time - start_time > 1:
            start_time = current_real_time
            to_delete = [tid for tid, data in tracked_violations.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
            for tid in to_delete:
                del tracked_violations[tid]
                print(f"Hapus track {tid} karena hilang lama")

def process_detection(frame, annotated_frame, x1, y1, x2, y2, cls_id, conf, track_id, current_real_time, video_time):
    class_name = model.names[int(cls_id)]
    print(f"Deteksi: {class_name} (conf: {conf:.2f}, track_id: {track_id}) at ({x1}, {y1}, {x2}, {y2})")
    
    center = ((x1 + x2) // 2, (y1 + y2) // 2)
    in_roi = any(point_in_polygon(center, region['points']) if region['type'] == 'polygon' else
                 (min(region['points'][0][0], region['points'][1][0]) <= center[0] <= max(region['points'][0][0], region['points'][1][0]) and
                  min(region['points'][0][1], region['points'][1][1]) <= center[1] <= max(region['points'][0][1], region['points'][1][1]))
                 for region in roi_regions)
    
    if not in_roi:
        print(f"Skip {class_name} pada track {track_id}: di luar ROI")
        return
    
    if PPE_CLASSES.get(class_name, False):
        if track_id not in tracked_violations:
            tracked_violations[track_id] = {'violations': set(), 'last_times': {}, 'last_seen': current_real_time, 'last_video_times': {}}
        tracked_violations[track_id]['last_seen'] = current_real_time
        
        if "no-" in class_name:
            width = x2 - x1
            height = y2 - y1
            pad_w = int(width * PADDING_PERCENT)
            pad_h = int(height * PADDING_PERCENT)
            x1_exp = max(0, x1 - pad_w)
            y1_exp = max(0, y1 - pad_h)
            x2_exp = min(frame.shape[1], x2 + pad_w)
            y2_exp = min(frame.shape[0], y2 + pad_h)
            
            if x2_exp <= x1_exp or y2_exp <= y1_exp:
                print(f"Skip simpan {class_name} pada {track_id}: bounding box invalid")
                return
            
            try:
                violation_crop = frame[y1_exp:y2_exp, x1_exp:x2_exp]
                print(f"Crop berhasil untuk {class_name} pada track {track_id}")
            except Exception as e:
                print(f"Error cropping: {e}")
                return
            
            if violation_crop.shape[1] < TARGET_MAX_WIDTH:
                try:
                    scale_factor = TARGET_MAX_WIDTH / violation_crop.shape[1]
                    new_height = int(violation_crop.shape[0] * scale_factor)
                    violation_crop = cv2.resize(violation_crop, (TARGET_MAX_WIDTH, new_height), interpolation=cv2.INTER_LINEAR)
                except Exception as e:
                    print(f"Error resizing crop: {e}")
                    return
            
            last_time = tracked_violations[track_id]['last_times'].get(class_name, 0)
            if last_time == 0 or (current_real_time - last_time) > COOLDOWN:
                tracked_violations[track_id]['violations'].add(class_name)
                try:
                    text_height = 80
                    polaroid = np.ones((violation_crop.shape[0] + text_height, violation_crop.shape[1], 3), dtype=np.uint8) * 255
                    polaroid[:violation_crop.shape[0], :] = violation_crop
                    
                    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    texts = [f"{class_name}", f"{timestamp_str}", f"{LOCATION}"]
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale = 0.5
                    font_thickness = 1
                    text_color = (0, 0, 0)
                    y_pos = violation_crop.shape[0] + 20
                    for text in texts:
                        cv2.putText(polaroid, text, (10, y_pos), font, font_scale, text_color, font_thickness)
                        y_pos += 25
                    
                    timestamp_file = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = os.path.join(OUTPUT_DIR, f"{track_id}_{class_name}_{timestamp_file}.jpg")
                    cv2.imwrite(filename, polaroid)
                    print(f"Pelanggaran {class_name} pada {track_id} disimpan: {filename}")
                    
                    tracked_violations[track_id]['last_times'][class_name] = current_real_time
                    tracked_violations[track_id]['last_video_times'][class_name] = video_time
                except Exception as e:
                    print(f"Error menyimpan polaroid: {e}")
                    return
    
    # Gambar bounding box pada annotated_frame (untuk web)
    color = ppe_colors.get(class_name, (0, 0, 0))
    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
    cv2.putText(annotated_frame, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

# --- Flask Endpoint untuk Video Feed ---
@app.route('/')
def index():
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
                    ret, jpeg = cv2.imencode('.jpg', annotated_frame)
                    if ret:
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
            time.sleep(0.2)  # Rate limit ke 5 FPS untuk kurangi beban memori
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

# --- Jalankan Thread di Background ---
frame_queue = queue.Queue(maxsize=QUEUE_SIZE)
capture_t = threading.Thread(target=capture_thread, args=(frame_queue,))
process_t = threading.Thread(target=process_thread, args=(frame_queue,))
capture_t.start()
process_t.start()

# Jalankan Flask webserver
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, threaded=True)  # Threaded untuk handle multiple request