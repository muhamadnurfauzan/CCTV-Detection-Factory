# original code

import cv2
import os
import datetime
from ultralytics import YOLO

# --- Konfigurasi ---
VIDEO_PATH = "video/vid2.mp4"     
OUTPUT_DIR = "violations"          
CONFIDENCE_THRESHOLD = 0.5          
MODEL_PATH = "model/helm detection.pt"       

# --- Setup ---
os.makedirs(OUTPUT_DIR, exist_ok=True)
model = YOLO(MODEL_PATH)

# --- Buka video ---
cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print("Gagal membuka video")
    exit()

frame_count = 0
while True:
    ret, frame = cap.read()
    if not ret:
        break
    frame_count += 1

    # Jalankan deteksi
    results = model(frame, conf=CONFIDENCE_THRESHOLD)

    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls.cpu().numpy())     
            conf = float(box.conf.cpu().numpy())   
            x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
            class_name = model.names[cls_id]

            # --- Pelanggaran ---
            if class_name in ["no-helmet", "no-boots", 'no-gloves', 'no-goggles', 'no-vest']:
                # Ensure bounding box is within frame boundaries
                h, w, _ = frame.shape
                x1_clip = max(0, min(x1, w - 1))
                x2_clip = max(0, min(x2, w))
                y1_clip = max(0, min(y1, h - 1))
                y2_clip = max(0, min(y2, h))
                if x2_clip > x1_clip and y2_clip > y1_clip:
                    violation_crop = frame[y1_clip:y2_clip, x1_clip:x2_clip]

                    # Nama file unik dengan timestamp + jenis pelanggaran
                    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = os.path.join(OUTPUT_DIR, f"{class_name}_{timestamp}.jpg")

                    cv2.imwrite(filename, violation_crop)
                    print(f"Pelanggaran {class_name} disimpan: {filename}")
                    
    # --- Tampilkan video dengan bounding box ---
    annotated_frame = results[0].plot()
    cv2.imshow("Detection", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
