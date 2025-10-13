# lanjutan polaroid-like dan tracking dengan person model

import cv2
import os
import datetime
import time
from ultralytics import YOLO
import numpy as np

# --- Konfigurasi ---
VIDEO_PATH = "video/cctv2.mov"  
OUTPUT_DIR = "violations"
CONFIDENCE_THRESHOLD = 0.3  # Untuk PPE model
PERSON_CONF = 0.1  # Turunin buat catch lebih banyak persons
MODEL_PATH = "model/helm detection.pt"  # PPE model
PERSON_MODEL_PATH = "model/yolov8n.pt"  # Pretrained YOLO untuk person
COOLDOWN = 5  # detik DALAM VIDEO
CLEANUP_INTERVAL = 60  # Hapus track kalau hilang >60 detik (real time)
PADDING_PERCENT = 0.5  # Expand bounding box by 50% untuk crop lebih besar
TARGET_MAX_WIDTH = 320  # Resize ke max ini kalau width < ini (proporsional)
LOCATION = "Plant A"  # Static location

# --- Setup ---
os.makedirs(OUTPUT_DIR, exist_ok=True)
model = YOLO(MODEL_PATH)  # PPE/violation model
person_model = YOLO(PERSON_MODEL_PATH)  # Person model (pretrained)
tracked_persons = {}  # {track_id: {'violations': set(), 'last_times': {}, 'last_seen': time.time(), 'last_video_times': {}}}

# Warna tetap per kelas PPE (RGB) => (Blue, Green, Red)
ppe_colors = {
    "no-helmet": (255, 0, 255),  # Magenta
    # "no-vest": (255, 255, 0),    # Kuning
    # "no-boots": (0, 0, 255),     # Merah
    # "no-gloves": (0, 255, 255),  # Cyan
    # "no-goggles": (255, 0, 0)    # Biru
}

# Daftar kelas violation (hanya ini yang diproses)
# VIOLATION_CLASSES = ["no-helmet", "no-vest", "no-boots", "no-gloves", "no-goggles"]
VIOLATION_CLASSES = ["no-helmet"]

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
    # frame_enhanced = cv2.GaussianBlur(frame_enhanced, (5, 5), 0)  # Dinonaktifkan sementara buat test kecepatan

    # Stage 1: Detect persons dengan tracking
    person_results = person_model.track(frame_enhanced, conf=PERSON_CONF, classes=0, persist=True)  # Classes=0 untuk 'person'

    current_real_time = time.time()  # Untuk last_seen dan cleanup

    # Inisialisasi frame untuk plot
    annotated_frame = frame.copy()  # Pakai frame asli untuk plot

    for person_result in person_results:
        for person_box in person_result.boxes:
            if person_box.id is None:
                continue

            person_cls_id = int(person_box.cls.cpu().numpy())
            if person_model.names[person_cls_id] != 'person':  # Pastiin class person
                continue

            person_conf = float(person_box.conf.cpu().numpy())
            px1, py1, px2, py2 = map(int, person_box.xyxy[0].cpu().numpy())
            track_id = int(person_box.id.cpu().numpy())

            # Update tracked_persons (pakai track_id dari person)
            if track_id not in tracked_persons:
                tracked_persons[track_id] = {'violations': set(), 'last_times': {}, 'last_seen': current_real_time, 'last_video_times': {}}
            else:
                tracked_persons[track_id]['last_seen'] = current_real_time

            # Crop person area (expand sedikit biar PPE masuk)
            p_width = px2 - px1
            p_height = py2 - py1
            p_pad_w = int(p_width * 0.2)  # Expand 20% untuk capture PPE full
            p_pad_h = int(p_height * 0.2)
            px1_crop = max(0, px1 - p_pad_w)
            py1_crop = max(0, py1 - p_pad_h)
            px2_crop = min(frame.shape[1], px2 + p_pad_w)
            py2_crop = min(frame.shape[0], py2 + p_pad_h)

            if px2_crop <= px1_crop or py2_crop <= py1_crop:
                continue

            person_crop = frame[py1_crop:py2_crop, px1_crop:px2_crop]  # Pakai frame asli
            print(f"Track ID {track_id}: Crop Size {person_crop.shape}")

            # Stage 2: Detect PPE/violation di crop person (tanpa tracking buat percepat)
            ppe_results = model.predict(person_crop, conf=CONFIDENCE_THRESHOLD)  # Ganti track dengan predict

            for ppe_result in ppe_results:
                for box in ppe_result.boxes:
                    cls_id = int(box.cls.cpu().numpy())
                    conf = float(box.conf.cpu().numpy())
                    x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                    class_name = model.names[cls_id]

                    # Debug: Print PPE detection
                    print(f"Track ID {track_id}: PPE Detected - {class_name} (Conf: {conf}) at Crop Coords ({x1}, {y1}, {x2}, {y2})")

                    # Adjust koordinat PPE kembali ke frame asli
                    x1 += px1_crop
                    y1 += py1_crop
                    x2 += px1_crop
                    y2 += py1_crop

                    # Plot PPE box di annotated_frame dengan warna tetap per kelas
                    color = ppe_colors.get(class_name, (0, 255, 0))  # Default hijau kalau kelas nggak ada
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(annotated_frame, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                    # Plot hanya kalau kelas violation
                    if class_name in VIOLATION_CLASSES:
                        # --- Pelanggaran ---
                        # Expand bounding box untuk crop lebih besar
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

                        # Resize proporsional ke max TARGET_MAX_WIDTH kalau perlu
                        new_width = violation_crop.shape[1]
                        new_height = violation_crop.shape[0]
                        if new_width < TARGET_MAX_WIDTH:
                            scale_factor = TARGET_MAX_WIDTH / new_width
                            new_height_resized = int(new_height * scale_factor)
                            violation_crop = cv2.resize(violation_crop, (TARGET_MAX_WIDTH, new_height_resized), interpolation=cv2.INTER_LINEAR)
                        else:
                            TARGET_MAX_WIDTH = new_width

                        # Check cooldown BERDASARKAN VIDEO_TIME
                        if class_name not in tracked_persons[track_id]['last_video_times'] or \
                           (video_time - tracked_persons[track_id]['last_video_times'][class_name]) > COOLDOWN:
                            
                            if class_name not in tracked_persons[track_id]['violations']:
                                tracked_persons[track_id]['violations'].add(class_name)

                            # Buat polaroid-like: Extend crop ke bawah untuk text area
                            text_height = 80
                            polaroid = np.ones((violation_crop.shape[0] + text_height, violation_crop.shape[1], 3), dtype=np.uint8) * 255
                            polaroid[:violation_crop.shape[0], :] = violation_crop

                            # Tambah text
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

                            # Simpan polaroid
                            timestamp_file = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                            filename = os.path.join(OUTPUT_DIR, f"{track_id}_{class_name}_{timestamp_file}.jpg")
                            cv2.imwrite(filename, polaroid)
                            print(f"Pelanggaran {class_name} pada orang {track_id} disimpan: {filename}")

                            # Update last video time (untuk cooldown) dan last real time
                            tracked_persons[track_id]['last_video_times'][class_name] = video_time
                            tracked_persons[track_id]['last_times'][class_name] = current_real_time

    # Cleanup periodik (tetap real time)
    if current_real_time - start_time > 1:
        start_time = current_real_time
        to_delete = [tid for tid, data in tracked_persons.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
        for tid in to_delete:
            del tracked_persons[tid]
            print(f"Hapus track {tid} karena hilang lama")

    # Tampilkan video dengan bounding box person dan PPE
    cv2.imshow("Detection", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()

# import cv2
# import os
# import datetime
# import time
# from ultralytics import YOLO
# import numpy as np

# # --- Konfigurasi ---
# VIDEO_PATH = "video/vid2.mp4"  
# OUTPUT_DIR = "violations"
# CONFIDENCE_THRESHOLD = 0.3  # Untuk PPE model
# PERSON_CONF = 0.1  # Turunin buat catch lebih banyak persons
# MODEL_PATH = "model/helm detection.pt"  # PPE model
# PERSON_MODEL_PATH = "model/yolov8n.pt"  # Pretrained YOLO untuk person
# COOLDOWN = 5  # detik DALAM VIDEO
# CLEANUP_INTERVAL = 60  # Hapus track kalau hilang >60 detik (real time)
# PADDING_PERCENT = 0.5  # Expand bounding box by 50% untuk crop lebih besar
# TARGET_MAX_WIDTH = 320  # Resize ke max ini kalau width < ini (proporsional)
# LOCATION = "Plant A"  # Static location

# # --- Setup ---
# os.makedirs(OUTPUT_DIR, exist_ok=True)
# model = YOLO(MODEL_PATH)  # PPE/violation model
# person_model = YOLO(PERSON_MODEL_PATH)  # Person model (pretrained)
# tracked_persons = {}  # {track_id: {'violations': set(), 'last_times': {}, 'last_seen': time.time(), 'last_video_times': {}}}

# # Warna tetap per kelas PPE (RGB) => (Blue, Green, Red)
# ppe_colors = {
#     "no-helmet": (255, 0, 255),  # Magenta
#     "no-vest": (255, 255, 0),    # Cyan
#     "no-boots": (0, 0, 255),   # Merah
#     "no-gloves": (0, 255, 255),    # Kuning
#     "no-goggles": (255, 0, 0)    # Biru
# }

# # --- Buka video ---
# cap = cv2.VideoCapture(VIDEO_PATH)
# if not cap.isOpened():
#     print("Gagal membuka video")
#     exit()

# frame_count = 0
# start_time = time.time()  # Untuk cleanup periodik (real time)

# while True:
#     ret, frame = cap.read()
#     if not ret:
#         break
#     frame_count += 1

#     # Ambil waktu DALAM VIDEO (detik)
#     video_time = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0  # Milidetik ke detik

#     # Pre-processing untuk improve deteksi
#     frame_enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)
#     frame_enhanced = cv2.GaussianBlur(frame_enhanced, (5, 5), 0)  # Tambah blur buat kurangi noise

#     # Stage 1: Detect persons dengan tracking
#     person_results = person_model.track(frame_enhanced, conf=PERSON_CONF, classes=0, persist=True)  # Classes=0 untuk 'person'

#     current_real_time = time.time()  # Untuk last_seen dan cleanup

#     # Inisialisasi frame untuk plot
#     annotated_frame = frame.copy()  # Pakai frame asli untuk plot

#     for person_result in person_results:
#         for person_box in person_result.boxes:
#             if person_box.id is None:
#                 continue

#             person_cls_id = int(person_box.cls.cpu().numpy())
#             if person_model.names[person_cls_id] != 'person':  # Pastiin class person
#                 continue

#             person_conf = float(person_box.conf.cpu().numpy())
#             px1, py1, px2, py2 = map(int, person_box.xyxy[0].cpu().numpy())
#             track_id = int(person_box.id.cpu().numpy())

#             # Update tracked_persons (pakai track_id dari person)
#             if track_id not in tracked_persons:
#                 tracked_persons[track_id] = {'violations': set(), 'last_times': {}, 'last_seen': current_real_time, 'last_video_times': {}}
#             else:
#                 tracked_persons[track_id]['last_seen'] = current_real_time

#             # Crop person area (expand sedikit biar PPE masuk)
#             p_width = px2 - px1
#             p_height = py2 - py1
#             p_pad_w = int(p_width * 0.2)  # Expand 20% untuk capture PPE full
#             p_pad_h = int(p_height * 0.2)
#             px1_crop = max(0, px1 - p_pad_w)
#             py1_crop = max(0, py1 - p_pad_h)
#             px2_crop = min(frame.shape[1], px2 + p_pad_w)
#             py2_crop = min(frame.shape[0], py2 + p_pad_h)

#             if px2_crop <= px1_crop or py2_crop <= py1_crop:
#                 continue

#             person_crop = frame[py1_crop:py2_crop, px1_crop:px2_crop]  # Pakai frame asli
#             print(f"Track ID {track_id}: Crop Size {person_crop.shape}")

#             # Stage 2: Detect PPE/violation di crop person
#             ppe_results = model.track(person_crop, conf=CONFIDENCE_THRESHOLD, persist=True, tracker="bytetrack.yaml")

#             for ppe_result in ppe_results:
#                 for box in ppe_result.boxes:
#                     cls_id = int(box.cls.cpu().numpy())
#                     conf = float(box.conf.cpu().numpy())
#                     x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
#                     class_name = model.names[cls_id]

#                     # Debug: Print PPE detection
#                     print(f"Track ID {track_id}: PPE Detected - {class_name} (Conf: {conf}) at Crop Coords ({x1}, {y1}, {x2}, {y2})")

#                     # Adjust koordinat PPE kembali ke frame asli
#                     x1 += px1_crop
#                     y1 += py1_crop
#                     x2 += px1_crop
#                     y2 += py1_crop

#                     # Plot PPE box di annotated_frame dengan warna tetap per kelas
#                     color = ppe_colors.get(class_name, (0, 255, 0))  # Default hijau kalau kelas nggak ada
#                     cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
#                     cv2.putText(annotated_frame, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

#                     # --- Pelanggaran ---
#                     if class_name in ["no-helmet", "no-boots", "no-gloves", "no-goggles", "no-vest"]:
#                         # Expand bounding box untuk crop lebih besar
#                         width = x2 - x1
#                         height = y2 - y1
#                         pad_w = int(width * PADDING_PERCENT)
#                         pad_h = int(height * PADDING_PERCENT)
#                         x1_exp = max(0, x1 - pad_w)
#                         y1_exp = max(0, y1 - pad_h)
#                         x2_exp = min(frame.shape[1], x2 + pad_w)
#                         y2_exp = min(frame.shape[0], y2 + pad_h)

#                         if x2_exp <= x1_exp or y2_exp <= y1_exp:
#                             print(f"Skip simpan {class_name} pada {track_id}: bounding box invalid")
#                             continue

#                         violation_crop = frame[y1_exp:y2_exp, x1_exp:x2_exp]

#                         # Resize proporsional ke max TARGET_MAX_WIDTH kalau perlu
#                         new_width = violation_crop.shape[1]
#                         new_height = violation_crop.shape[0]
#                         if new_width < TARGET_MAX_WIDTH:
#                             scale_factor = TARGET_MAX_WIDTH / new_width
#                             new_height_resized = int(new_height * scale_factor)
#                             violation_crop = cv2.resize(violation_crop, (TARGET_MAX_WIDTH, new_height_resized), interpolation=cv2.INTER_LINEAR)
#                         else:
#                             TARGET_MAX_WIDTH = new_width

#                         # Check cooldown BERDASARKAN VIDEO_TIME
#                         if class_name not in tracked_persons[track_id]['last_video_times'] or \
#                            (video_time - tracked_persons[track_id]['last_video_times'][class_name]) > COOLDOWN:
                            
#                             if class_name not in tracked_persons[track_id]['violations']:
#                                 tracked_persons[track_id]['violations'].add(class_name)

#                             # Buat polaroid-like: Extend crop ke bawah untuk text area
#                             text_height = 80
#                             polaroid = np.ones((violation_crop.shape[0] + text_height, violation_crop.shape[1], 3), dtype=np.uint8) * 255
#                             polaroid[:violation_crop.shape[0], :] = violation_crop

#                             # Tambah text
#                             timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
#                             texts = [f"{class_name}", f"{timestamp_str}", f"{LOCATION}"]
#                             font = cv2.FONT_HERSHEY_SIMPLEX
#                             font_scale = 0.5
#                             font_thickness = 1
#                             text_color = (0, 0, 0)
#                             y_pos = violation_crop.shape[0] + 20
#                             for text in texts:
#                                 cv2.putText(polaroid, text, (10, y_pos), font, font_scale, text_color, font_thickness)
#                                 y_pos += 25

#                             # Simpan polaroid
#                             timestamp_file = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
#                             filename = os.path.join(OUTPUT_DIR, f"{track_id}_{class_name}_{timestamp_file}.jpg")
#                             cv2.imwrite(filename, polaroid)
#                             print(f"Pelanggaran {class_name} pada orang {track_id} disimpan: {filename}")

#                             # Update last video time (untuk cooldown) dan last real time
#                             tracked_persons[track_id]['last_video_times'][class_name] = video_time
#                             tracked_persons[track_id]['last_times'][class_name] = current_real_time

#     # Cleanup periodik (tetap real time)
#     if current_real_time - start_time > 1:
#         start_time = current_real_time
#         to_delete = [tid for tid, data in tracked_persons.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
#         for tid in to_delete:
#             del tracked_persons[tid]
#             print(f"Hapus track {tid} karena hilang lama")

#     # Tampilkan video dengan bounding box person dan PPE
#     cv2.imshow("Detection", annotated_frame)

#     if cv2.waitKey(1) & 0xFF == ord("q"):
#         break

# cap.release()
# cv2.destroyAllWindows()