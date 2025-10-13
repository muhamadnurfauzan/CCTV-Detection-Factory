# polaroid-like dengan text area di bawah

import cv2
import os
import datetime
import time
from ultralytics import YOLO
import numpy as np

# --- Konfigurasi ---
VIDEO_PATH = "video/vid2.mp4"  
OUTPUT_DIR = "violations"
CONFIDENCE_THRESHOLD = 0.
MODEL_PATH = "model/helm detection.pt"
COOLDOWN = 5  # detik DALAM VIDEO
CLEANUP_INTERVAL = 60  # Hapus track kalau hilang >60 detik (real time)
PADDING_PERCENT = 0.5  # Expand bounding box by 50% untuk crop lebih besar
TARGET_MAX_WIDTH = 320  # Resize ke max ini kalau width < ini (proporsional)
LOCATION = "Plant A"  # Static location

# --- Setup ---
os.makedirs(OUTPUT_DIR, exist_ok=True)
model = YOLO(MODEL_PATH)
tracked_persons = {}  # {track_id: {'violations': set(), 'last_times': {}, 'last_seen': time.time(), 'last_video_times': {}}}  # Tambah 'last_video_times'

# --- Buka video ---
cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print("Gagal membuka video")
    exit()

frame_count = 0
start_time = time.time()  # Untuk cleanup periodik (real time)

while True:
    ret, frame = cap.read()
    if not ret:
        break
    frame_count += 1

    # Ambil waktu DALAM VIDEO (detik)
    video_time = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0  # Milidetik ke detik

    # Pre-processing untuk improve deteksi
    frame_enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)

    # Jalankan deteksi dengan TRACKING
    results = model.track(frame_enhanced, conf=CONFIDENCE_THRESHOLD, persist=True)

    current_real_time = time.time()  # Untuk last_seen dan cleanup

    for result in results:
        for box in result.boxes:
            if box.id is None:
                continue

            cls_id = int(box.cls.cpu().numpy())
            conf = float(box.conf.cpu().numpy())
            x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
            class_name = model.names[cls_id]
            track_id = int(box.id.cpu().numpy())

            # Update tracked_persons
            if track_id not in tracked_persons:
                tracked_persons[track_id] = {'violations': set(), 'last_times': {}, 'last_seen': current_real_time, 'last_video_times': {}}
            else:
                tracked_persons[track_id]['last_seen'] = current_real_time

            # --- Pelanggaran ---
            # if class_name in ["no-helmet", "no-boots", "no-gloves", "no-goggles", "no-vest"]:
            if class_name in ["no-helmet"]:
                # Expand bounding box untuk crop lebih besar
                width = x2 - x1
                height = y2 - y1
                pad_w = int(width * PADDING_PERCENT)
                pad_h = int(height * PADDING_PERCENT)
                x1_exp = max(0, x1 - pad_w)
                y1_exp = max(0, y1 - pad_h)
                x2_exp = min(frame.shape[1], x2 + pad_w)
                y2_exp = min(frame.shape[0], y2 + pad_h)

                # Clipping setelah expand
                if x2_exp <= x1_exp or y2_exp <= y1_exp:
                    print(f"Skip simpan {class_name} pada {track_id}: bounding box invalid")
                    continue

                violation_crop = frame[y1_exp:y2_exp, x1_exp:x2_exp]

                # Resize proporsional ke max TARGET_MAX_WIDTH kalau perlu
                new_width = violation_crop.shape[1]
                new_height = violation_crop.shape[0]
                if new_width < TARGET_MAX_WIDTH:
                    scale_factor = TARGET_MAX_WIDTH / new_width
                    new_height_resized = int(new_height * scale_factor)
                    violation_crop = cv2.resize(violation_crop, (TARGET_MAX_WIDTH, new_height_resized), interpolation=cv2.INTER_LINEAR)
                else:
                    # Kalau udah >=320, keep as is
                    TARGET_MAX_WIDTH = new_width  # Update biar polaroid sesuai

                # Check cooldown BERDASARKAN VIDEO_TIME
                if class_name not in tracked_persons[track_id]['last_video_times'] or \
                   (video_time - tracked_persons[track_id]['last_video_times'][class_name]) > COOLDOWN:
                    
                    if class_name not in tracked_persons[track_id]['violations']:
                        tracked_persons[track_id]['violations'].add(class_name)

                    # Buat polaroid-like: Extend crop ke bawah untuk text area
                    text_height = 80  # Ruang untuk text
                    polaroid = np.ones((violation_crop.shape[0] + text_height, violation_crop.shape[1], 3), dtype=np.uint8) * 255  # White background
                    polaroid[:violation_crop.shape[0], :] = violation_crop  # Paste crop di atas

                    # Tambah text
                    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    texts = [
                        f"{class_name}",
                        f"{timestamp_str}",
                        f"{LOCATION}"
                    ]
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale = 0.5
                    font_thickness = 1
                    text_color = (0, 0, 0)  # Black
                    y_pos = violation_crop.shape[0] + 20  # Mulai di bawah crop
                    for text in texts:
                        cv2.putText(polaroid, text, (10, y_pos), font, font_scale, text_color, font_thickness)
                        y_pos += 25  # Spacing

                    # Simpan polaroid
                    timestamp_file = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = os.path.join(OUTPUT_DIR, f"{track_id}_{class_name}_{timestamp_file}.jpg")
                    cv2.imwrite(filename, polaroid)
                    print(f"Pelanggaran {class_name} pada orang {track_id} disimpan: {filename}")

                    # Update last video time (untuk cooldown) dan last real time (jika perlu)
                    tracked_persons[track_id]['last_video_times'][class_name] = video_time
                    tracked_persons[track_id]['last_times'][class_name] = current_real_time  # Keep kalau butuh

                    # TODO: Kirim email

    # Cleanup periodik (tetap real time)
    if current_real_time - start_time > 1:
        start_time = current_real_time
        to_delete = [tid for tid, data in tracked_persons.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
        for tid in to_delete:
            del tracked_persons[tid]
            print(f"Hapus track {tid} karena hilang lama")

    # --- Tampilkan video dengan bounding box (font dan box lebih tipis) ---
    annotated_frame = results[0].plot(font_size=0.7, line_width=1)
    cv2.imshow("Detection", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()