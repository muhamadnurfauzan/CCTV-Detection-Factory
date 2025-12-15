import time
import cv2
import gc
import os
import numpy as np
from ultralytics import YOLO
from collections import deque
from threading import Event, Thread
import logging
from shared_state import state
from config import (
    CONFIDENCE_THRESHOLD, QUEUE_SIZE, FRAME_SKIP, CLEANUP_INTERVAL, MODEL_PATH, CCTV_RATIO
)
from services.cctv_services import refresh_all_cctv_configs
from core.violation_processor import process_detection
from utils.helpers import get_color_for_class

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def open_stream(cctv, max_retries=5, retry_delay=1):
    video_path = f"rtsps://{cctv['ip_address']}:{cctv['port']}/{cctv['token']}?enableSrtp"
    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FPS, 5)
    # Force TCP untuk stability (hindari UDP packet loss)
    os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'
    # Force MJPG (lebih ringan) bila kamera mendukung
    cap.set(cv2.CAP_PROP_FOURCC, 
            cv2.VideoWriter_fourcc('M','J','P','G'))
    if not cap.isOpened():
        logging.warning(f"[{cctv['name']}] Gagal RTSPS, fallback RTSP...")
        rtsp_url = video_path.replace("rtsps://", "rtsp://").replace(":7441", ":7447")
        logging.info(f"[{cctv['name']}] Attempting RTSP stream: {rtsp_url}")
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            logging.error(f"[{cctv['name']}] TIDAK DAPAT MEMBUKA STREAM. Check URL/Firewall.")
            return None
    return cap

def reconnect_cap(cctv, cap, max_retries=5, retry_delay=1):
    """Reconnect cap dengan backoff"""
    for attempt in range(max_retries):
        print(f"[{cctv['name']}] Reconnecting stream (attempt {attempt + 1}/{max_retries})...")
        try:
            cap.release()  
        except Exception as e:
            logging.warning(f"[{cctv['name']}] Failed to release old cap: {e}")
        time.sleep(retry_delay * (2 ** attempt))  
        cap = open_stream(cctv)
        if cap and cap.isOpened():
            print(f"[{cctv['name']}] Reconnected successfully.")
            return cap
    print(f"[{cctv['name']}] Failed to reconnect after {max_retries} attempts.")
    return None

def capture_thread(cctv_id, frame_queue, stop_event):
    cctv = state.cctv_configs[cctv_id]
    cap = open_stream(cctv)
    if not cap:
        logging.error(f"[{cctv_id}] Thread exit: Initial stream failed.")
        return 

    fail_count = 0
    max_fails = 10
    frame_count = 0

    while not stop_event.is_set():
        ret, frame = cap.read()

        # --- HANYA UPDATE JIKA FRAME VALID ---
        if ret and frame is not None:
            # Update raw frame untuk streaming polos
            with state.RAW_FRAME_LOCK:
                state.raw_frames[cctv_id] = (frame.copy(), time.time())

            # Masukkan ke queue hanya tiap FRAME_SKIP
            if frame_count % FRAME_SKIP == 0:
                if len(frame_queue) < frame_queue.maxlen:
                    frame_queue.append(frame.copy())
            frame_count += 1
            fail_count = 0
        else:
            # Frame gagal → reconnect
            fail_count += 1
            logging.warning(f"[{cctv_id}] Frame read failed ({fail_count}/{max_fails})")
            
            if fail_count >= max_fails:
                cap.release()
                cap = reconnect_cap(cctv, cap) or open_stream(cctv)
                if cap:
                    fail_count = 0
                else:
                    # Update placeholder jika total gagal
                    placeholder = np.zeros((480, 640, 3), np.uint8)
                    cv2.putText(placeholder, "Stream Failed", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 3)
                    with state.ANNOTATED_FRAME_LOCK:
                        state.annotated_frames[cctv_id] = (placeholder, time.time())
                    with state.RAW_FRAME_LOCK:
                        state.raw_frames[cctv_id] = (placeholder, time.time())
                    time.sleep(5)
                    continue

        if stop_event.is_set():
            break

        time.sleep(0.01)

    if cap:
        cap.release()
    logging.info(f"[{cctv_id}] Capture thread stopped.")

def process_thread(cctv_id, frame_queue, stop_event):
    """
    Thread utama: ambil frame → deteksi → anotasi → proses violation.
    Hanya 1 write lock per frame → nol contention dengan video_feed.
    """
    tracked_violations = {}
    model = YOLO(MODEL_PATH).to("cpu")

    # Jalankan cleanup thread
    Thread(target=cleanup_thread, args=(tracked_violations,), daemon=True).start()

    # Dapatkan konfigurasi CCTV
    cctv_cfg = state.cctv_configs[cctv_id]
    roi_regions = cctv_cfg["roi"]
    
    # Gunakan CCTV_RATIO sebagai fallback
    json_width = cctv_cfg.get("json_width", CCTV_RATIO[0]) 
    json_height = cctv_cfg.get("json_height", CCTV_RATIO[1])

    while not stop_event.is_set():
        # PROSES FRAME (SATU-SATUNYA YANG WRITE LOCK)
        if frame_queue:
            frame = frame_queue.popleft()
            start_time = time.time()

            annotated = frame.copy()
            frame_height, frame_width = frame.shape[:2]

            # Hitung faktor skala (Cek untuk menghindari pembagian dengan nol)
            scale_x = frame_width / json_width if json_width > 0 else 1.0
            scale_y = frame_height / json_height if json_height > 0 else 1.0

            # --- Gambar ROI ---
            for region in roi_regions:
                scaled_points = region["points"].copy() 
                scaled_points[:, 0] *= scale_x
                scaled_points[:, 1] *= scale_y
                
                pts = scaled_points.astype(np.int32).reshape((-1, 1, 2))
                
                cv2.polylines(annotated, [pts], True, (0, 0, 255), 2)

            # --- Ambil active IDs ---
            active_ids = state.ACTIVE_VIOLATION_CACHE.get(cctv_id, [])

            # --- Bangun track_classes ---
            track_classes = set(active_ids)
            for viol_id in active_ids:
                ppe_id = state.PPE_VIOLATION_PAIRS.get(viol_id)
                if ppe_id:
                    track_classes.add(ppe_id)
            track_classes = list(track_classes) if active_ids else None

            print(f"[CCTV {cctv_id}] Active IDs: {active_ids} | Tracking: {track_classes}")

            try:
                results = model.track(
                    frame,
                    conf=CONFIDENCE_THRESHOLD,
                    persist=True,
                    tracker="bytetrack.yaml"
                )

                for r in results:
                    for box in r.boxes:
                        if box.id is None:
                            continue

                        x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        track_id = int(box.id[0])
                        class_name = model.names[cls_id]

                        # Gambar box
                        color = get_color_for_class(class_name)
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(annotated, f"{class_name} {conf:.2f}",
                                    (x1, max(y1 - 10, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                        # Validasi violation
                        class_info = state.OBJECT_CLASS_CACHE.get(class_name)
                        if not class_info or not class_info["is_violation"]:
                            continue
                        if class_info["id"] not in active_ids:
                            continue

                        process_detection(
                            cctv_id, frame, annotated, x1, y1, x2, y2,
                            cls_id, conf, track_id, model, tracked_violations
                        )

            except Exception as e:
                logging.error(f"[CCTV {cctv_id}] DETECTION ERROR → {e}")

            # === SATU-SATUNYA WRITE LOCK (nol contention) ===
            with state.ANNOTATED_FRAME_LOCK:
                state.annotated_frames[cctv_id] = (annotated, time.time())

            gc.collect()
            end_time = time.time()
            logging.info(f"[CCTV {cctv_id}] Processed frame in {end_time - start_time:.2f}s")

        else:
            time.sleep(0.01)  # CPU friendly

    # Cleanup
    with state.ANNOTATED_FRAME_LOCK:
        state.annotated_frames.pop(cctv_id, None)
    logging.info(f"[CCTV {cctv_id}] process_thread stopped.")

def cleanup_thread(tracked_violations):
    """Membersihkan data pelanggaran lama yang tidak aktif."""
    while True:
        now = time.time()
        removed_count = 0

        # Iterasi salinan list supaya aman saat penghapusan
        for track_id in list(tracked_violations.keys()):
            data = tracked_violations[track_id]
            last_times = data.get("last_times", {})
            if not last_times:
                continue

            # Ambil waktu terakhir kali objek ini terlihat
            last_seen = max(last_times.values(), default=0)

            # Jika objek sudah tidak aktif selama CLEANUP_INTERVAL
            if now - last_seen > CLEANUP_INTERVAL:
                # Log class-class yang dihapus
                classes_removed = list(last_times.keys())
                print(
                    f"[CLEANUP] Hapus track_id={track_id} "
                    f"dengan pelanggaran={classes_removed} "
                    f"(tidak aktif selama {int(now - last_seen)} detik)"
                )

                # Hapus track dari memori
                del tracked_violations[track_id]
                removed_count += 1

        if removed_count > 0:
            print(f"[CLEANUP] Total {removed_count} track lama dihapus.")
        time.sleep(CLEANUP_INTERVAL)

def start_detection_for_cctv(cctv_id: int, full_detection: bool = True):
    current = state.detection_threads.get(cctv_id, {})
    desired_mode = 'full' if full_detection else 'stream_only'
    current_mode = current.get('mode')

    # HANYA restart jika mode berubah atau thread mati
    if current_mode == desired_mode and current.get('threads'):
        # Sudah sesuai, tidak perlu apa-apa
        logging.info(f"[SCHEDULER] CCTV {cctv_id} sudah di mode {desired_mode}, skip restart.")
        return

    # Baru stop kalau memang perlu ganti mode
    if cctv_id in state.detection_threads:
        stop_detection_for_cctv(cctv_id)
        time.sleep(0.5)

    stop_event = Event()
    state.detection_threads[cctv_id] = {
        'stop_event': stop_event,
        'threads': [],
        'mode': 'full' if full_detection else 'stream_only'
    }

    frame_queue = deque(maxlen=QUEUE_SIZE)

    # SELALU jalankan capture_thread
    t_capture = Thread(target=capture_thread, args=(cctv_id, frame_queue, stop_event), daemon=True)
    t_capture.start()
    state.detection_threads[cctv_id]['threads'].append(t_capture)

    # Hanya jalankan process_thread jika full_detection
    if full_detection:
        t_process = Thread(target=process_thread, args=(cctv_id, frame_queue, stop_event), daemon=True)
        t_process.start()
        state.detection_threads[cctv_id]['threads'].append(t_process)

    # Init placeholder
    placeholder = np.zeros((480, 640, 3), np.uint8)
    cv2.putText(placeholder, "Initializing...", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,255), 3)
    with state.ANNOTATED_FRAME_LOCK:
        state.annotated_frames[cctv_id] = (placeholder, time.time())
    with state.RAW_FRAME_LOCK:
        state.raw_frames[cctv_id] = (placeholder, time.time())

def stop_detection_for_cctv(cctv_id):
    """Menghentikan thread deteksi untuk CCTV ID tertentu."""
    if cctv_id in state.detection_threads:
        info = state.detection_threads.pop(cctv_id)
        info['stop_event'].set() # Mengirim sinyal stop
        logging.info(f"[THREAD] Stopped detection threads for CCTV {cctv_id}.")
        # Note: Thread akan selesai setelah sinyal set dan loop-nya di-cek.

def stop_all_detections():
    """Mengirim sinyal penghentian ke semua thread deteksi yang aktif."""
    # Iterasi melalui salinan keys karena detection_threads akan dimodifikasi
    for cctv_id in list(state.detection_threads.keys()):
        # Memanggil fungsi stop untuk setiap CCTV ID
        stop_detection_for_cctv(cctv_id)
    
    # Tunggu sebentar (opsional) agar thread memiliki waktu untuk berhenti
    time.sleep(0.5)