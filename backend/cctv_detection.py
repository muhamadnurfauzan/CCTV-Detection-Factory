import os
import time
import cv2
import gc
import torch
import datetime
import numpy as np
from ultralytics import YOLO
from multiprocessing import Queue, Process
from threading import Thread
from collections import deque
import logging
import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

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

def open_stream(cctv):
    video_path = f"rtsps://{cctv['ip_address']}:{cctv['port']}/{cctv['token']}?enableSrtp"
    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        logging.warning(f"[{cctv['name']}] Gagal RTSPS, fallback RTSP...")
        rtsp_url = video_path.replace("rtsps://", "rtsp://").replace(":7441", ":7447")
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            logging.error(f"[{cctv['name']}] Tidak dapat membuka stream.")
            return None
    return cap

def process_detection(cctv_id, frame, annotated, x1, y1, x2, y2, cls_id, conf, track_id, model, tracked_violations):
    cctv_cfg = config.cctv_configs[cctv_id]
    roi_regions = cctv_cfg["roi"]
    location = cctv_cfg["location"]

    class_name = model.names[int(cls_id)]
    center = ((x1 + x2)//2, (y1 + y2)//2)
    if not any(point_in_polygon(center, r["points"]) for r in roi_regions):
        return
    if not config.PPE_CLASSES.get(class_name, False) or conf < config.CONFIDENCE_THRESHOLD:
        return
    if "no-" not in class_name:
        return

    now = time.time()
    data = tracked_violations.setdefault(track_id, {"last_times": {}})
    last_time = data["last_times"].get(class_name, 0)
    if now - last_time < config.COOLDOWN:
        return

    h, w = frame.shape[:2]
    pad_w, pad_h = int((x2-x1)*config.PADDING_PERCENT), int((y2-y1)*config.PADDING_PERCENT)
    x1e, y1e = max(0, x1-pad_w), max(0, y1-pad_h)
    x2e, y2e = min(w, x2+pad_w), min(h, y2+pad_h)
    crop = frame[y1e:y2e, x1e:x2e]
    if crop.size == 0:
        return
    if crop.shape[1] > config.TARGET_MAX_WIDTH:
        scale = config.TARGET_MAX_WIDTH / crop.shape[1]
        crop = cv2.resize(crop, (config.TARGET_MAX_WIDTH, int(crop.shape[0]*scale)))

    polaroid = np.ones((crop.shape[0]+80, crop.shape[1], 3), dtype=np.uint8)*255
    polaroid[:crop.shape[0], :] = crop
    y_pos = crop.shape[0] + 20
    for text in [class_name, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), location]:
        cv2.putText(polaroid, text, (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,0), 1)
        y_pos += 25

    cctv_dir = os.path.join(config.OUTPUT_DIR, str(cctv_id))
    os.makedirs(cctv_dir, exist_ok=True)
    filename = os.path.join(cctv_dir, f"{track_id}_{class_name}_{datetime.datetime.now():%Y%m%d_%H%M%S}.jpg")
    cv2.imwrite(filename, polaroid)
    logging.info(f"[CCTV {cctv_id}] Violation saved: {filename}")
    data["last_times"][class_name] = now

def capture_thread(cctv_id, frame_queue):
    cctv = config.cctv_configs[cctv_id]
    cap = open_stream(cctv)
    if not cap:
        return
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            logging.warning(f"[CCTV {cctv_id}] Frame read failed.")
            time.sleep(0.5)
            continue
        if frame_count % config.FRAME_SKIP == 0:
            frame_queue.append(frame)
        frame_count += 1

def process_thread(cctv_id, frame_queue):
    tracked_violations = {}
    model = YOLO(config.MODEL_PATH)
    model.to("cpu")
    logging.info(f"YOLO loaded for CCTV {cctv_id}")

    roi_regions = config.cctv_configs[cctv_id]["roi"]

    while True:
        if not frame_queue:
            time.sleep(0.02)
            continue

        frame = frame_queue.pop()
        annotated = frame.copy()

        # --- Gambar ROI lebih dulu ---
        for region in roi_regions:
            pts = np.array(region["points"], np.int32)
            pts = pts.reshape((-1, 1, 2))
            cv2.polylines(annotated, [pts], isClosed=True, color=(0, 255, 255), thickness=2)
            cv2.putText(annotated, region.get("name", "ROI"), tuple(pts[0][0]),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        try:
            results = model.track(
                frame, conf=config.CONFIDENCE_THRESHOLD,
                persist=True, tracker="bytetrack.yaml"
            )

            for r in results:
                for box in r.boxes:
                    if box.id is None:
                        continue

                    x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                    cls_id = int(box.cls.cpu().numpy()[0])
                    conf = float(box.conf.cpu().numpy()[0])
                    track_id = int(box.id.cpu().numpy()[0])
                    class_name = model.names[cls_id]

                    # --- Gambar bounding box ---
                    color = (0, 255, 0) if "no-" not in class_name else (0, 0, 255)
                    cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

                    # --- Label teks di atas box ---
                    label = f"{class_name} {conf:.2f} ID:{track_id}"
                    cv2.putText(annotated, label, (x1, max(20, y1 - 10)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                    # --- Proses pelanggaran ---
                    process_detection(
                        cctv_id, frame, annotated,
                        x1, y1, x2, y2, cls_id, conf, track_id,
                        model, tracked_violations
                    )

        except Exception as e:
            logging.error(f"[CCTV {cctv_id}] Detection error: {e}")

        # Simpan annotated frame untuk ditampilkan di frontend
        config.annotated_frames[cctv_id] = annotated
        gc.collect()

def start_all_detections():
    threads = []
    for cctv_id in config.cctv_configs.keys():
        config.annotated_frames[cctv_id] = np.zeros((480, 640, 3), dtype=np.uint8)  # placeholder frame hitam
        frame_queue = deque(maxlen=2)
        t1 = Thread(target=capture_thread, args=(cctv_id, frame_queue), daemon=True)
        t2 = Thread(target=process_thread, args=(cctv_id, frame_queue), daemon=True)
        t1.start(); t2.start()
        threads.append((t1, t2))
    return threads

