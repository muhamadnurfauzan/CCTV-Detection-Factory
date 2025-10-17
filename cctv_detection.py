# cctv_detection.py
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

from config import MODEL_PATH, CONFIDENCE_THRESHOLD, FRAME_SKIP, RESIZE_SCALE, QUEUE_SIZE, CLEANUP_INTERVAL, json_image_width, json_image_height, roi_regions, VIDEO_PATH, PPE_CLASSES, ppe_colors, PADDING_PERCENT, TARGET_MAX_WIDTH, LOCATION, COOLDOWN, OUTPUT_DIR

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Global untuk annotated_frame dan lock
annotated_frame = None  # Awalnya None, update di thread
frame_lock = threading.Lock()

frame_buffer = deque(maxlen=1)

tracked_violations = {}

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

def open_stream():
    cap = cv2.VideoCapture(VIDEO_PATH, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 20000)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 10000)
    
    if not cap.isOpened():
        logging.warning("Gagal RTSPS. Mencoba RTSP...")
        rtsp_url = VIDEO_PATH.replace("rtsps://", "rtsp://").replace(":7441", ":7447")
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            logging.error("Masih gagal RTSP. Cek URL.")
            return None
    logging.info("Stream opened successfully")
    return cap

def process_detection(frame, annotated_frame_local, x1, y1, x2, y2, cls_id, conf, track_id, current_real_time, video_time, model, tracked_violations):
    class_name = model.names[int(cls_id)]
    # logging.info(f"Deteksi: {class_name} (conf: {conf:.2f}, track_id: {track_id}) at ({x1}, {y1}, {x2}, {y2})") # Debugging info deteksi kelas model berhasil
    
    center = ((x1 + x2) // 2, (y1 + y2) // 2)
    in_roi = any(point_in_polygon(center, region['points']) if region['type'] == 'polygon' else
                 (min(region['points'][0][0], region['points'][1][0]) <= center[0] <= max(region['points'][0][0], region['points'][1][0]) and
                  min(region['points'][0][1], region['points'][1][1]) <= center[1] <= max(region['points'][0][1], region['points'][1][1]))
                 for region in roi_regions)
    
    if not in_roi:
        logging.info(f"Skip {class_name} pada track {track_id}: di luar ROI")
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
                logging.info(f"Skip simpan {class_name} pada {track_id}: bounding box invalid")
                return
            
            try:
                violation_crop = frame[y1_exp:y2_exp, x1_exp:x2_exp]
                # logging.info(f"Crop berhasil untuk {class_name} pada track {track_id}") # Debugging info crop berhasil
            except Exception as e:
                logging.error(f"Error cropping: {e}")
                return
            
            if violation_crop.shape[1] < TARGET_MAX_WIDTH:
                try:
                    scale_factor = TARGET_MAX_WIDTH / violation_crop.shape[1]
                    new_height = int(violation_crop.shape[0] * scale_factor)
                    violation_crop = cv2.resize(violation_crop, (TARGET_MAX_WIDTH, new_height), interpolation=cv2.INTER_LINEAR)  # Kembalikan ke normal
                except Exception as e:
                    logging.error(f"Error resizing crop: {e}")
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
                    cv2.imwrite(filename, polaroid, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    logging.info(f"Pelanggaran {class_name} pada {track_id} disimpan: {filename}")
                    
                    tracked_violations[track_id]['last_times'][class_name] = current_real_time
                    tracked_violations[track_id]['last_video_times'][class_name] = video_time
                except Exception as e:
                    logging.error(f"Error simpan polaroid: {e}")
                    return
    
    # Gambar bounding box pada annotated_frame_local
    color = ppe_colors.get(class_name, (0, 0, 0))
    cv2.rectangle(annotated_frame_local, (x1, y1), (x2, y2), color, 2)
    cv2.putText(annotated_frame_local, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

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
            logging.info(f"Queue filled with frame {frame_count}, shape {frame.shape}")
            while not frame_queue.empty():
                try:
                    frame_queue.get_nowait()
                except queue.Empty:
                    break
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
    global annotated_frame

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
            # frame, capture_time = frame_queue.get(timeout=1)
            frame = None
            capture_time = None
            while not frame_queue.empty():
                try:
                    frame, capture_time = frame_queue.get_nowait()
                except queue.Empty:
                    break
            if frame is None:
                continue
        except queue.Empty:
            continue

        current_real_time = time.time()
        video_time = capture_time - start_time

        try:
            frame_enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)
        except Exception as e:
            logging.error(f"Preprocessing error: {e}")
            frame_enhanced = frame

        # Resize for model only
        frame_for_model = cv2.resize(frame_enhanced, (1280, 768), interpolation=cv2.INTER_AREA)
        annotated_frame_local = frame.copy()  # Use original for high quality
        for region in roi_regions:
            if region['type'] == 'polygon':
                cv2.polylines(annotated_frame_local, [region['points']], isClosed=True, color=(0, 165, 255), thickness=2)
            elif region['type'] == 'line':
                cv2.line(annotated_frame_local, tuple(region['points'][0]), tuple(region['points'][1]), (0, 165, 255), 2)

        if model is not None:
            try:
                with torch.no_grad():
                    frame_tensor = torch.from_numpy(frame_for_model.transpose(2, 0, 1)).unsqueeze(0).float().to(device) / 255.0
                    ppe_results = model.track(frame_tensor, conf=CONFIDENCE_THRESHOLD, persist=True)
                    for ppe_result in ppe_results:
                        for box in ppe_result.boxes:
                            if box.id is None:
                                continue
                            x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                            # Scale back to original frame
                            scale_x = frame.shape[1] / 1280
                            scale_y = frame.shape[0] / 768
                            x1 = int(x1 * scale_x)
                            y1 = int(y1 * scale_y)
                            x2 = int(x2 * scale_x)
                            y2 = int(y2 * scale_y)
                            cls_id = int(box.cls.cpu().numpy()[0])
                            conf = float(box.conf.cpu().numpy()[0])
                            track_id = int(box.id.cpu().numpy()[0])
                            process_detection(frame, annotated_frame_local, x1, y1, x2, y2, cls_id, conf, track_id, current_real_time, video_time, model, tracked_violations)
            except Exception as e:
                logging.error(f"Detection error: {e}")

        with frame_lock:
            annotated_frame = annotated_frame_local
            frame_buffer.clear()
            frame_buffer.append(annotated_frame_local.copy())
            # logging.debug(f"Updated annotated_frame with shape {annotated_frame.shape}, sum {np.sum(annotated_frame)}") # Debugging info frame ada/tidak

        del frame_enhanced, frame_for_model
        gc.collect()

        logging.debug(f"Frame latency: {current_real_time - capture_time:.3f}s")

        if current_real_time - cleanup_timer > CLEANUP_INTERVAL:
            cleanup_timer = current_real_time
            to_delete = [tid for tid, data in tracked_violations.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
            for tid in to_delete:
                del tracked_violations[tid]
                logging.info(f"Removed track {tid}")

def start_detection():
    frame_queue = queue.Queue(maxsize=QUEUE_SIZE)
    capture_t = threading.Thread(target=capture_thread, args=(frame_queue,), daemon=True)
    process_t = threading.Thread(target=process_thread, args=(frame_queue,), daemon=True)
    capture_t.start()
    process_t.start()
    logging.info("Detection threads started: capture_t and process_t (daemon)")