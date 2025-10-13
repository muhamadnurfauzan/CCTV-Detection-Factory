# Coba integrasi ke CCTV

import cv2
import os
import datetime
import time
from ultralytics import YOLO
import numpy as np
import json

# --- Konfigurasi ---
VIDEO_PATH = "rtsps://192.168.199.9:7441/sKDBmnGEmed2VzuM?enableSrtp"  # Token baru dari mentor (cek expired)
OUTPUT_DIR = "violations"
CONFIDENCE_THRESHOLD = 0.3  # Untuk PPE model
PERSON_CONF = 0.1  # Turunin buat catch lebih banyak persons
MODEL_PATH = "model/helm detection.pt"  # PPE model
PERSON_MODEL_PATH = "model/yolov8n.pt"  # Pretrained YOLO untuk person
COOLDOWN = 5  # detik DALAM WAKTU REAL (bukan video)
CLEANUP_INTERVAL = 60  # Hapus track kalau hilang >60 detik (real time)
PADDING_PERCENT = 0.5  # Expand bounding box by 50% untuk crop lebih besar
TARGET_MAX_WIDTH = 320  # Resize ke max ini kalau width < ini (proporsional)
LOCATION = "Plant A"  # Static location

# --- Load ROI dari JSON ---
JSON_PATH = "JSON/cctv2_area.json"  # Ganti dengan path file JSON dari GUI
roi_regions = []  # List of regions (polygons or rectangles)
json_image_width = 0
json_image_height = 0

def load_roi_from_json(json_path):
    global roi_regions, json_image_width, json_image_height
    with open(json_path, 'r') as f:
        data = json.load(f)
        json_image_width = data.get('image_width', 0)
        json_image_height = data.get('image_height', 0)
        for item in data.get('items', []):
            points = item['points']
            roi_regions.append({
                'type': item['type'],
                'points': np.array(points, dtype=np.float32)  # Use float for scaling
            })

load_roi_from_json(JSON_PATH)

# --- Kostumisasi Kelas PPE ---
PPE_CLASSES = {
    "helmet": True,
    "no-helmet": True,
}

# --- Setup ---
os.makedirs(OUTPUT_DIR, exist_ok=True)
model = YOLO(MODEL_PATH)
person_model = YOLO(PERSON_MODEL_PATH)
tracked_persons = {}

# Warna tetap per kelas PPE (RGB)
ppe_colors = {
    "no-helmet": (255, 0, 255),
    "helmet": (0, 255, 0),
}

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

# --- Buka video ---
cap = cv2.VideoCapture(VIDEO_PATH)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Kurangi buffer
cap.set(cv2.CAP_PROP_FPS, 15)  # Target FPS
if not cap.isOpened():
    print("Gagal membuka stream CCTV. Cek URL/token/SRTP.")
    exit()

# Dapatkan ukuran frame video
ret, frame = cap.read()
if ret:
    video_height, video_width, _ = frame.shape
    scale_x = video_width / json_image_width
    scale_y = video_height / json_image_height
    for region in roi_regions:
        region['points'] = (region['points'] * np.array([scale_x, scale_y])).astype(np.int32)

frame_count = 0
start_time = time.time()

while True:
    ret, frame = cap.read()
    if not ret:
        print("Stream drop, reconnect...")
        cap.release()
        cap = cv2.VideoCapture(VIDEO_PATH)
        time.sleep(5)
        continue

    current_real_time = time.time()

    # Pre-processing
    frame_enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)

    # Stage 1: Detect persons
    person_results = person_model.track(frame_enhanced, conf=PERSON_CONF, classes=0, persist=True)

    # Inisialisasi frame untuk plot
    annotated_frame = frame.copy()

    # Gambar ROI
    overlay = annotated_frame.copy()
    for region in roi_regions:
        if region['type'] == 'polygon':
            cv2.fillPoly(overlay, [region['points']], (0, 165, 255))
            cv2.polylines(annotated_frame, [region['points']], isClosed=True, color=(0, 165, 255), thickness=2)
        elif region['type'] == 'line':
            cv2.line(annotated_frame, tuple(region['points'][0]), tuple(region['points'][1]), (0, 165, 255), 2)
    cv2.addWeighted(overlay, 0.3, annotated_frame, 1 - 0.3, 0, annotated_frame)

    for person_result in person_results:
        for person_box in person_result.boxes:
            if person_box.id is None:
                continue

            person_cls_id = int(person_box.cls.cpu().numpy())
            if person_model.names[person_cls_id] != 'person':
                continue

            person_conf = float(person_box.conf.cpu().numpy())
            px1, py1, px2, py2 = map(int, person_box.xyxy[0].cpu().numpy())
            track_id = int(person_box.id.cpu().numpy())

            person_center = ((px1 + px2) // 2, (py1 + py2) // 2)
            in_roi = any(point_in_polygon(person_center, region['points']) if region['type'] == 'polygon' else
                        (min(region['points'][0][0], region['points'][1][0]) <= person_center[0] <= max(region['points'][0][0], region['points'][1][0]) and
                         min(region['points'][0][1], region['points'][1][1]) <= person_center[1] <= max(region['points'][0][1], region['points'][1][1]))
                        for region in roi_regions)

            if in_roi:
                if track_id not in tracked_persons:
                    tracked_persons[track_id] = {'violations': set(), 'last_times': {}, 'last_seen': current_real_time, 'last_video_times': {}}
                else:
                    tracked_persons[track_id]['last_seen'] = current_real_time

                p_width = px2 - px1
                p_height = py2 - py1
                p_pad_w = int(p_width * 0.2)
                p_pad_h = int(p_height * 0.2)
                px1_crop = max(0, px1 - p_pad_w)
                py1_crop = max(0, py1 - p_pad_h)
                px2_crop = min(frame.shape[1], px2 + p_pad_w)
                py2_crop = min(frame.shape[0], py2 + p_pad_h)

                if px2_crop <= px1_crop or py2_crop <= py1_crop:
                    continue

                person_crop = frame[py1_crop:py2_crop, px1_crop:px2_crop]

                ppe_results = model.predict(person_crop, conf=CONFIDENCE_THRESHOLD)

                for ppe_result in ppe_results:
                    for box in ppe_result.boxes:
                        cls_id = int(box.cls.cpu().numpy())
                        conf = float(box.conf.cpu().numpy())
                        x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                        class_name = model.names[cls_id]

                        x1 += px1_crop
                        y1 += py1_crop
                        x2 += px1_crop
                        y2 += py1_crop

                        if PPE_CLASSES.get(class_name, False):
                            color = ppe_colors.get(class_name, (0, 0, 0))
                            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                            cv2.putText(annotated_frame, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

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

                                violation_crop = frame[y1_exp:y2_exp, x1_exp:x2_exp]

                                new_width = violation_crop.shape[1]
                                new_height = violation_crop.shape[0]
                                if new_width < TARGET_MAX_WIDTH:
                                    scale_factor = TARGET_MAX_WIDTH / new_width
                                    new_height_resized = int(new_height * scale_factor)
                                    violation_crop = cv2.resize(violation_crop, (TARGET_MAX_WIDTH, new_height_resized), interpolation=cv2.INTER_LINEAR)
                                else:
                                    TARGET_MAX_WIDTH = new_width

                                if class_name not in tracked_persons[track_id]['last_video_times'] or \
                                   (current_real_time - tracked_persons[track_id]['last_times'][class_name]) > COOLDOWN:
                                    if class_name not in tracked_persons[track_id]['violations']:
                                        tracked_persons[track_id]['violations'].add(class_name)

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
                                    print(f"Pelanggaran {class_name} pada orang {track_id} disimpan: {filename}")

                                    tracked_persons[track_id]['last_video_times'][class_name] = current_real_time
                                    tracked_persons[track_id]['last_times'][class_name] = current_real_time

    # Cleanup periodik
    if current_real_time - start_time > 1:
        start_time = current_real_time
        to_delete = [tid for tid, data in tracked_persons.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
        for tid in to_delete:
            del tracked_persons[tid]
            print(f"Hapus track {tid} karena hilang lama")

    cv2.imshow("Detection", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()