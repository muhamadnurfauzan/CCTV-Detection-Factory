import threading
import queue
import time
import cv2
import gc
import torch
import datetime
import numpy as np
from ultralytics import YOLO
from collections import deque
import logging
import os

from config import (
    MODEL_PATH, CONFIDENCE_THRESHOLD, FRAME_SKIP, QUEUE_SIZE,
    CLEANUP_INTERVAL, json_image_width, json_image_height, roi_regions,
    VIDEO_PATH, PPE_CLASSES, PPE_COLORS, PADDING_PERCENT, TARGET_MAX_WIDTH,
    LOCATION, COOLDOWN, OUTPUT_DIR, CCTV_RATIO
)

# --- Logging lebih ringan ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# --- Global variabel ---
annotated_frame = None
frame_lock = threading.Lock()
frame_buffer = deque(maxlen=1)
tracked_violations = {}

# --- Helper polygon ---
def point_in_polygon(point, polygon):
    x, y = point
    inside = False
    n = len(polygon)
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y) and x <= max(p1x, p2x):
                if p1y != p2y:
                    xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                if p1x == p2x or x <= xinters:
                    inside = not inside
        p1x, p1y = p2x, p2y
    return inside


# --- Stream open ---
def open_stream():
    cap = cv2.VideoCapture(VIDEO_PATH, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        logging.warning("Gagal RTSPS. Coba fallback RTSP...")
        rtsp_url = VIDEO_PATH.replace("rtsps://", "rtsp://").replace(":7441", ":7447")
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            logging.error("Masih gagal RTSP. Cek URL atau koneksi kamera.")
            return None
    logging.info("Stream opened successfully")
    return cap


# --- Proses deteksi pelanggaran ---
def process_detection(frame, annotated_frame_local, x1, y1, x2, y2, cls_id, conf, track_id, current_real_time, video_time, model, tracked_violations):
    class_name = model.names[int(cls_id)]

    center = ((x1 + x2) // 2, (y1 + y2) // 2)
    in_roi = any(
        point_in_polygon(center, region['points'])
        if region['type'] == 'polygon'
        else (
            min(region['points'][0][0], region['points'][1][0]) <= center[0] <= max(region['points'][0][0], region['points'][1][0])
            and min(region['points'][0][1], region['points'][1][1]) <= center[1] <= max(region['points'][0][1], region['points'][1][1])
        )
        for region in roi_regions
    )

    if not in_roi:
        return  # langsung skip, tanpa log

    if not PPE_CLASSES.get(class_name, False):
        return

    # --- Pelanggaran "no-" class ---
    if "no-" in class_name:
        data = tracked_violations.setdefault(track_id, {'last_times': {}})
        last_time = data['last_times'].get(class_name, 0)
        if current_real_time - last_time < COOLDOWN:
            return

        # --- Crop dan simpan ---
        h, w = frame.shape[:2]
        pad_w, pad_h = int((x2 - x1) * PADDING_PERCENT), int((y2 - y1) * PADDING_PERCENT)
        x1e, y1e = max(0, x1 - pad_w), max(0, y1 - pad_h)
        x2e, y2e = min(w, x2 + pad_w), min(h, y2 + pad_h)
        crop = frame[y1e:y2e, x1e:x2e]
        if crop.size == 0:
            return
        if crop.shape[1] < TARGET_MAX_WIDTH:
            new_h = int(TARGET_MAX_WIDTH * crop.shape[0] / crop.shape[1])
            crop = cv2.resize(crop, (TARGET_MAX_WIDTH, new_h), interpolation=cv2.INTER_LINEAR)

        # Polaroid + teks
        polaroid = np.ones((crop.shape[0] + 80, crop.shape[1], 3), dtype=np.uint8) * 255
        polaroid[:crop.shape[0], :] = crop
        y_pos = crop.shape[0] + 20
        for text in [class_name, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), LOCATION]:
            cv2.putText(polaroid, text, (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
            y_pos += 25

        filename = os.path.join(OUTPUT_DIR, f"{track_id}_{class_name}_{datetime.datetime.now():%Y%m%d_%H%M%S}.jpg")
        cv2.imwrite(filename, polaroid, [cv2.IMWRITE_JPEG_QUALITY, 90])
        logging.info(f"Violation saved: {filename}")
        data['last_times'][class_name] = current_real_time

    # --- Draw box ---
    color = PPE_COLORS.get(class_name, (0, 0, 255))
    cv2.rectangle(annotated_frame_local, (x1, y1), (x2, y2), color, 2)
    cv2.putText(annotated_frame_local, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)


# --- Capture Thread ---
def capture_thread(frame_queue):
    while True:
        cap = open_stream()
        if cap is None:
            logging.error("Failed to open stream, retrying in 5 seconds...")
            time.sleep(5)
            continue
        frame_count = 0
        scaled = False
        while True:
            ret, frame = cap.read()
            if not ret:
                logging.warning("Failed to read frame, reconnecting...")
                cap.release()
                time.sleep(1)
                break
            frame_count += 1
            if frame_count % FRAME_SKIP != 0:
                continue

            # flush queue agar hanya frame terbaru
            while not frame_queue.empty():
                try:
                    frame_queue.get_nowait()
                except queue.Empty:
                    break
            try:
                frame_queue.put((frame, time.time()), block=False)
            except queue.Full:
                continue

            # ROI scaling hanya sekali
            if not scaled:
                h, w = frame.shape[:2]
                sx = w / json_image_width if json_image_width > 0 else 1.0
                sy = h / json_image_height if json_image_height > 0 else 1.0
                for region in roi_regions:
                    region['points'] = (region['points'] * np.array([sx, sy])).astype(np.int32)
                scaled = True
                logging.info("ROI scaled once.")
        cap.release()

# --- Process Thread ---
def process_thread(frame_queue):
    global annotated_frame
    tracked_violations = {}

    try:
        model = YOLO(MODEL_PATH)
        model.to("cpu")
        logging.info("YOLO loaded successfully (CPU mode)")
    except Exception as e:
        logging.error(f"Failed to load YOLO: {e}")
        return

    last_cleanup = time.time()
    roi_scaled = False  # hanya scale sekali

    while True:
        try:
            frame, capture_time = frame_queue.get(timeout=1)
        except queue.Empty:
            continue

        start = time.time()
        annotated_local = frame.copy()

        # --- Resize untuk model ---
        frame_for_model = cv2.resize(frame, CCTV_RATIO, interpolation=cv2.INTER_AREA)

        # --- Gambar ROI ---
        for region in roi_regions:
            try:
                # Convert points ke numpy array float untuk scaling
                points = np.array(region["points"], dtype=np.float32)

                # Scaling sesuai ukuran frame saat ini
                scale_x = annotated_local.shape[1] / json_image_width if json_image_width > 0 else 1.0
                scale_y = annotated_local.shape[0] / json_image_height if json_image_height > 0 else 1.0
                points[:, 0] *= scale_x
                points[:, 1] *= scale_y
                points_int = points.astype(np.int32)

                if region["type"] == "polygon" and len(points_int) >= 3:
                    cv2.polylines(annotated_local, [points_int], True, (0, 165, 255), 5, lineType=cv2.LINE_AA)
                elif region["type"] == "line" and len(points_int) == 2:
                    p1, p2 = tuple(points_int[0]), tuple(points_int[1])
                    cv2.line(annotated_local, p1, p2, (0, 165, 255), 5, lineType=cv2.LINE_AA)
            except Exception as e:
                logging.warning(f"ROI draw error: {e}")

        # --- Deteksi cepat ---
        try:
            with torch.no_grad():
                results = model.track(
                    frame_for_model,
                    conf=CONFIDENCE_THRESHOLD,
                    persist=True,
                    tracker="bytetrack.yaml"
                )

            for r in results:
                for box in r.boxes:
                    if box.id is None:
                        continue

                    # Ambil hasil box
                    x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())

                    # Skala balik ke ukuran frame asli
                    scale_x = frame.shape[1] / CCTV_RATIO[0]
                    scale_y = frame.shape[0] / CCTV_RATIO[1]
                    x1, y1, x2, y2 = (
                        int(x1 * scale_x), int(y1 * scale_y),
                        int(x2 * scale_x), int(y2 * scale_y)
                    )

                    cls_id = int(box.cls.cpu().numpy()[0])
                    conf = float(box.conf.cpu().numpy()[0])
                    track_id = int(box.id.cpu().numpy()[0])

                    # Jalankan deteksi pelanggaran
                    process_detection(
                        frame, annotated_local,
                        x1, y1, x2, y2,
                        cls_id, conf, track_id,
                        time.time(), capture_time,
                        model, tracked_violations
                    )

        except Exception as e:
            logging.error(f"Detection error: {e}")

        # --- Update global frame untuk Flask ---
        with frame_lock:
            annotated_frame = annotated_local
            frame_buffer.clear()
            frame_buffer.append(annotated_local.copy())

        gc.collect()

        # --- Cleanup data track lama ---
        now = time.time()
        if now - last_cleanup > CLEANUP_INTERVAL:
            expired = [
                tid for tid, d in tracked_violations.items()
                if now - d.get("last_seen", 0) > CLEANUP_INTERVAL
            ]
            for tid in expired:
                del tracked_violations[tid]
                logging.info(f"Removed expired track {tid}")
            last_cleanup = now

        # log tiap 50 frame aja
        if int(time.time()) % 10 == 0:
            logging.info(f"Process FPS ≈ {1.0 / max(1e-5, (time.time() - start)):.2f}")

def start_detection():
    frame_queue = queue.Queue(maxsize=QUEUE_SIZE)
    threading.Thread(target=capture_thread, args=(frame_queue,), daemon=True).start()
    threading.Thread(target=process_thread, args=(frame_queue,), daemon=True).start()
    logging.info("Detection threads started.")
