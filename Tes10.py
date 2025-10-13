# base tes7 (no people detecting) tapi langsung buka stream CCTV pakai ffmpeg, bukan cv2.VideoCapture dan no window

import cv2
import os
import datetime
import time
import numpy as np
import json
from ultralytics import YOLO

# --- Konfigurasi ---
VIDEO_PATH = "rtsps://192.168.199.9:7441/sKDBmnGEmed2VzuM?enableSrtp"  # CCTV URL
OUTPUT_DIR = "violations"
CONFIDENCE_THRESHOLD = 0.3  # Untuk PPE model
MODEL_PATH = "model/helm detection.pt"  # PPE model
COOLDOWN = 15  # Perpanjang cooldown ke 20 detik
CLEANUP_INTERVAL = 60  # Hapus track kalau hilang >60 detik
PADDING_PERCENT = 0.5  # Expand bounding box
TARGET_MAX_WIDTH = 320  # Resize untuk polaroid
LOCATION = "Plant A"
JSON_PATH = "JSON/vid2_area.json"
FRAME_SKIP = 5  # Proses setiap 5 frame untuk optimasi
RESIZE_SCALE = 0.5  # Resize frame ke 50% untuk kecepatan

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

# --- Main Processing Loop ---
cap = open_stream()
if cap is None:
    exit()

# Skalakan ROI berdasarkan resize
ret, frame = cap.read()
if not ret:
    print("Gagal membaca frame awal.")
    cap.release()
    exit()

video_height, video_width = frame.shape[:2]
video_width = int(video_width * RESIZE_SCALE)
video_height = int(video_height * RESIZE_SCALE)
scale_x = video_width / json_image_width
scale_y = video_height / json_image_height
for region in roi_regions:
    region['points'] = (region['points'] * np.array([scale_x, scale_y])).astype(np.int32)

cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # Reset ke frame awal
frame_count = 0
start_time = time.time()

while True:
    try:
        ret, frame = cap.read()
        if not ret:
            print("Gagal membaca frame. Mencoba reconnect...")
            cap.release()
            time.sleep(2)  # Delay sebelum reconnect
            cap = open_stream()
            if cap is None:
                break
            continue
    except Exception as e:
        print(f"Error saat baca frame: {e}")
        cap.release()
        time.sleep(2)
        cap = open_stream()
        if cap is None:
            break
        continue
    
    frame_count += 1
    if frame_count % FRAME_SKIP != 0:  # Skip frame untuk optimasi
        continue
    
    # Resize frame untuk kecepatan
    frame = cv2.resize(frame, (0, 0), fx=RESIZE_SCALE, fy=RESIZE_SCALE)
    video_time = frame_count / cap.get(cv2.CAP_PROP_FPS)  # Estimasi waktu
    current_real_time = time.time()
    
    # Pre-processing
    try:
        frame_enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)
    except Exception as e:
        print(f"Error preprocessing frame: {e}")
        continue
    
    # Detect PPE langsung
    try:
        ppe_results = model.track(frame_enhanced, conf=CONFIDENCE_THRESHOLD, persist=True)
    except Exception as e:
        print(f"Error YOLO inference: {e}")
        continue
    
    # Gambar ROI pada frame untuk visualisasi
    annotated_frame = frame.copy()
    for region in roi_regions:
        if region['type'] == 'polygon':
            cv2.polylines(annotated_frame, [region['points']], isClosed=True, color=(0, 165, 255), thickness=2)
        elif region['type'] == 'line':
            cv2.line(annotated_frame, tuple(region['points'][0]), tuple(region['points'][1]), (0, 165, 255), 2)
    
    for ppe_result in ppe_results:
        for box in ppe_result.boxes:
            if box.id is None:
                continue
                
            # Perbaiki DeprecationWarning
            cls_id = int(box.cls.cpu().numpy()[0])
            conf = float(box.conf.cpu().numpy()[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
            class_name = model.names[cls_id]
            track_id = int(box.id.cpu().numpy()[0])
            
            # Debug: Cetak deteksi
            print(f"Deteksi: {class_name} (conf: {conf:.2f}, track_id: {track_id}) at ({x1}, {y1}, {x2}, {y2})")
            
            # Cek apakah PPE ada di ROI
            center = ((x1 + x2) // 2, (y1 + y2) // 2)
            in_roi = any(point_in_polygon(center, region['points']) if region['type'] == 'polygon' else
                         (min(region['points'][0][0], region['points'][1][0]) <= center[0] <= max(region['points'][0][0], region['points'][1][0]) and
                          min(region['points'][0][1], region['points'][1][1]) <= center[1] <= max(region['points'][0][1], region['points'][1][1]))
                         for region in roi_regions)
            
            if not in_roi:
                print(f"Skip {class_name} pada track {track_id}: di luar ROI")
                # Gambar bounding box untuk visualisasi
                color = ppe_colors.get(class_name, (0, 0, 0))
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(annotated_frame, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                continue
            
            if PPE_CLASSES.get(class_name, False):
                # Update tracking
                if track_id not in tracked_violations:
                    tracked_violations[track_id] = {'violations': set(), 'last_times': {}, 'last_seen': current_real_time, 'last_video_times': {}}
                tracked_violations[track_id]['last_seen'] = current_real_time
                
                # Proses violation
                if class_name in [k for k, v in PPE_CLASSES.items() if "no-" in k and v]:
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
                        continue
                    
                    try:
                        violation_crop = frame[y1_exp:y2_exp, x1_exp:x2_exp]
                        print(f"Crop berhasil untuk {class_name} pada track {track_id}")
                    except Exception as e:
                        print(f"Error cropping: {e}")
                        continue
                    
                    if violation_crop.shape[1] < TARGET_MAX_WIDTH:
                        try:
                            scale_factor = TARGET_MAX_WIDTH / violation_crop.shape[1]
                            new_height = int(violation_crop.shape[0] * scale_factor)
                            violation_crop = cv2.resize(violation_crop, (TARGET_MAX_WIDTH, new_height), interpolation=cv2.INTER_LINEAR)
                        except Exception as e:
                            print(f"Error resizing crop: {e}")
                            continue
                    
                    # Gunakan current_real_time untuk cooldown yang lebih akurat
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
                            continue
                    
                    # Gambar bounding box untuk visualisasi
                    color = ppe_colors.get(class_name, (0, 0, 0))
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(annotated_frame, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    # Tampilkan frame dengan ROI dan bounding box
    # try:
    #     cv2.imshow("CCTV Detection", annotated_frame)
    #     if cv2.waitKey(1) & 0xFF == ord('q'):
    #         break
    # except Exception as e:
    #     print(f"Error menampilkan frame: {e}")
    #     continue
    
    # Cleanup periodik
    if current_real_time - start_time > 1:
        start_time = current_real_time
        to_delete = [tid for tid, data in tracked_violations.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
        for tid in to_delete:
            del tracked_violations[tid]
            print(f"Hapus track {tid} karena hilang lama")

cap.release()
cv2.destroyAllWindows()