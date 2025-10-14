import cv2
import numpy as np
import time
import gc
import torch
import threading
import queue
from ultralytics import YOLO
import psutil

from config import VIDEO_PATH, MODEL_PATH, CONFIDENCE_THRESHOLD, FRAME_SKIP, RESIZE_SCALE, CLEANUP_INTERVAL
from utils import load_roi_from_json, open_stream, process_detection, roi_regions, json_image_width, json_image_height

# Global untuk annotated_frame dan lock (akan diimport di app.py)
annotated_frame = None
frame_lock = threading.Lock()

# Load ROI hanya sekali di utils.py
load_roi_from_json()

# Load model
model = None  # Global, init nanti

def init_model():
    global model
    if model is None:
        try:
            model = YOLO(MODEL_PATH, device='cpu')
            # model.half() 
            print("Model loaded successfully with FP16")
        except Exception as e:
            print(f"Gagal load model YOLO: {e}")
            exit()

tracked_violations = {}  # {track_id: {'violations': set(), 'last_times': {}, 'last_seen': time.time(), 'last_video_times': {}}}

# --- Thread untuk Capture Frame ---
def capture_thread(frame_queue, video_path=VIDEO_PATH):
    cap = open_stream(video_path)
    if cap is None:
        return
    
    frame_count = 0
    scaled = False  # Flag untuk scaling ROI
    while True:
        try:
            ret, frame = cap.read()
            if not ret:
                print("Gagal membaca frame. Reconnect...")
                cap.release()
                cap = open_stream(video_path)
                if cap is None:
                    break
                continue
            frame_count += 1
            if frame_count % FRAME_SKIP != 0:
                continue
            frame = cv2.resize(frame, (0, 0), fx=RESIZE_SCALE, fy=RESIZE_SCALE)
            print(f"Queue diisi dengan frame {frame_count} pada {time.time()}")
            frame_queue.put((frame, time.time()))  # Put frame dan waktu
            
            if not scaled:
                video_height, video_width = frame.shape[:2]
                scale_x = video_width / json_image_width if json_image_width > 0 else 1.0
                scale_y = video_height / json_image_height if json_image_height > 0 else 1.0
                for region in roi_regions:
                    region['points'] = (region['points'] * np.array([scale_x, scale_y])).astype(np.int32)
                scaled = True
                print("ROI scaled setelah frame pertama dibaca.")
        except Exception as e:
            print(f"Error capture: {e}")
            cap.release()
            cap = open_stream(video_path)
            if cap is None:
                break

# --- Main Processing Thread ---
def process_thread(frame_queue):
    start_time = time.time()
    while True:
        try:
            frame, capture_time = frame_queue.get(timeout=1)
        except queue.Empty:
            continue

        current_real_time = time.time()
        video_time = capture_time - start_time  # Estimasi waktu berdasarkan capture
        
        # Pre-processing with error handling
        try:
            frame_enhanced = cv2.convertScaleAbs(frame, alpha=1.2, beta=10)
        except Exception as e:
            print(f"Error preprocessing: {e}")
            continue
        
        # Persiapan annotated_frame untuk visualisasi (untuk web)
        annotated_frame_local = frame.copy()
        for region in roi_regions:
            if region['type'] == 'polygon':
                cv2.polylines(annotated_frame_local, [region['points']], isClosed=True, color=(0, 165, 255), thickness=2)
            elif region['type'] == 'line':
                cv2.line(annotated_frame_local, tuple(region['points'][0]), tuple(region['points'][1]), (0, 165, 255), 2)

        # Deteksi with error handling dan optimasi memori
        try:
            init_model()
            print(f"Memori sebelum inference: {psutil.Process().memory_info().rss / 1024**2:.2f} MB")
            with torch.no_grad():  
                ppe_results = model.track(frame_enhanced, conf=CONFIDENCE_THRESHOLD, persist=True)
                time.sleep(0.2)
                print(f"Memori setelah inference: {psutil.Process().memory_info().rss / 1024**2:.2f} MB")
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
            print(f"Error deteksi: {e}")
            continue
        
        # Update global annotated_frame untuk web stream
        with frame_lock:
            global annotated_frame
            annotated_frame = annotated_frame_local
        
        # Cleanup memori
        del frame_enhanced  
        gc.collect()
        
        # Cleanup tracked_violations
        if current_real_time - start_time > 1:
            start_time = current_real_time
            to_delete = [tid for tid, data in tracked_violations.items() if current_real_time - data['last_seen'] > CLEANUP_INTERVAL]
            for tid in to_delete:
                del tracked_violations[tid]
                print(f"Hapus track {tid} karena hilang lama")