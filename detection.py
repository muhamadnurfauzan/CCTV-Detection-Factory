# detection.py
import threading
import queue
import time
import cv2
import gc
import torch
import numpy as np
from ultralytics import YOLO
import logging

from config import MODEL_PATH, CONFIDENCE_THRESHOLD, FRAME_SKIP, RESIZE_SCALE, QUEUE_SIZE, CLEANUP_INTERVAL, json_image_width, json_image_height, roi_regions
from utils import open_stream, point_in_polygon, process_detection

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Inisialisasi annotated_frame sebagai placeholder
annotated_frame = np.zeros((384, 640, 3), dtype=np.uint8)  # Match resize
frame_lock = threading.Lock()

tracked_violations = {}

def capture_thread(frame_queue):
    cap = open_stream()
    if cap is None:
        logging.error("Failed to open stream")
        return

    frame_count = 0
    scaled = False
    while True:
        try:
            ret, frame = cap.read()
            if not ret:
                logging.warning("Failed to read frame, reconnecting...")
                cap.release()
                cap = open_stream()
                if cap is None:
                    break
                continue
            frame_count += 1
            if frame_count % FRAME_SKIP != 0:
                continue
            # Resize ke dimensi divisible by 32
            frame = cv2.resize(frame, (640, 384), interpolation=cv2.INTER_AREA)
            logging.info(f"Queue filled with frame {frame_count}, shape {frame.shape}")
            frame_queue.put((frame, time.time()))

            if not scaled:
                video_height, video_width = frame.shape[:2]
                scale_x = video_width / json_image_width if json_image_width > 0 else 1.0
                scale_y = video_height / json_image_height if json_image_height > 0 else 1.0
                for region in roi_regions:
                    region['points'] = (region['points'] * np.array([scale_x, scale_y])).astype(np.int32)
                scaled = True
                logging.info("ROI scaled")
        except Exception as e:
            logging.error(f"Capture error: {e}")
            cap.release()
            cap = open_stream()
            if cap is None:
                break

def process_thread(frame_queue):
    try:
        model = YOLO(MODEL_PATH)
        device = torch.device('cpu')
        model.to(device)
        logging.info("YOLO loaded on CPU in FP32")
    except Exception as e:
        logging.error(f"Failed to load YOLO: {e}")
        model = None

    start_time = time.time()
    cleanup_timer = start_time
    while True:
        try:
            frame, capture_time = frame_queue.get(timeout=1)
        except queue.Empty:
            continue

        current_real_time = time.time()
        video_time = capture_time - start_time

        try:
            frame_enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)
        except Exception as e:
            logging.error(f"Preprocessing error: {e}")
            frame_enhanced = frame

        annotated_frame_local = frame.copy()
        for region in roi_regions:
            if region['type'] == 'polygon':
                cv2.polylines(annotated_frame_local, [region['points']], isClosed=True, color=(0, 165, 255), thickness=2)
            elif region['type'] == 'line':
                cv2.line(annotated_frame_local, tuple(region['points'][0]), tuple(region['points'][1]), (0, 165, 255), 2)

        if model is not None:
            try:
                with torch.no_grad():
                    frame_tensor = torch.from_numpy(frame_enhanced.transpose(2, 0, 1)).unsqueeze(0).float().to(device) / 255.0
                    ppe_results = model.track(frame_tensor, conf=CONFIDENCE_THRESHOLD, persist=True)
                    for ppe_result in ppe_results:
                        for box in ppe_result.boxes:
                            if box.id is None:
                                continue
                            x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                            cls_id = int(box.cls.cpu().numpy()[0])
                            conf = float(box.conf.cpu().numpy()[0])
                            track_id = int(box.id.cpu().numpy()[0])
                            process_detection(frame, annotated_frame_local, x1, y1, x2, y2, cls_id, conf, track_id, current_real_time, video_time, model, tracked_violations)
            except Exception as e:
                logging.error(f"Detection error: {e}")

        with frame_lock:
            # Update annotated_frame tanpa deklarasi global lagi
            if annotated_frame_local is not None and np.sum(annotated_frame_local) > 0:  # Cek bukan black
                annotated_frame = annotated_frame_local
                logging.debug(f"Updated annotated_frame with shape {annotated_frame.shape}, sum {np.sum(annotated_frame)}")
            else:
                annotated_frame = frame
                logging.warning("Using fallback frame")

        del frame_enhanced
        gc.collect()

        if current_real_time - cleanup_timer > CLEANUP_INTERVAL:
            cleanup_timer = current_real_time
            to_delete = [tid for tid, data in tracked_violations.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
            for tid in to_delete:
                del tracked_violations[tid]
                logging.info(f"Removed track {tid}")

def start_detection():
    frame_queue = queue.Queue(maxsize=QUEUE_SIZE)
    capture_t = threading.Thread(target=capture_thread, args=(frame_queue,))
    process_t = threading.Thread(target=process_thread, args=(frame_queue,))
    capture_t.start()
    process_t.start()