import argparse
import logging
import time
import cv2
import os
import gc
import torch
import redis
import numpy as np
from ultralytics import YOLO
from collections import deque
from threading import Thread, Event

import sys
import os

# Mendapatkan path absolut dari direktori 'backend'
# __file__ adalah path pm2_manager.py, dirname pertama adalah folder 'workers', 
# dirname kedua adalah folder 'backend'
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)

if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Import dari modul yang sudah ada
from shared_state import state
import services.config_service as config_service
from services.cctv_services import load_all_cctv_configs
from core.violation_processor import process_detection
from utils.helpers import get_color_for_class
from config import (
    CONFIDENCE_THRESHOLD, QUEUE_SIZE, FRAME_SKIP, CLEANUP_INTERVAL, 
    MODEL_PATH, CCTV_RATIO
)

# Setup logging khusus worker agar tidak tercampur
logging.basicConfig(level=logging.INFO, format="%(asctime)s - [WORKER] - %(message)s")

redis_client = redis.Redis(host='localhost', port=6379, db=0)

class CCTVWorker:
    def __init__(self, cctv_id):
        self.cctv_id = int(cctv_id)
        self.stop_event = Event()
        self.frame_queue = deque(maxlen=QUEUE_SIZE)
        self.tracked_violations = {}
        self.cctv_config = None
        self.model = None
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'

    def load_config(self):
        """Mengambil konfigurasi spesifik CCTV dan GLOBAL CACHE dari database."""
        # MUAT DATA PENDUKUNG KE MEMORI WORKER
        config_service.load_object_classes()
        config_service.load_violation_pairs()
        config_service.load_detection_settings()

        configs = load_all_cctv_configs()
        self.cctv_config = configs.get(self.cctv_id)
        if not self.cctv_config:
            raise Exception(f"Konfigurasi untuk CCTV ID {self.cctv_id} tidak ditemukan.")

    def open_stream(self):
        """Logika pembukaan stream dari detection.py."""
        cctv = self.cctv_config
        video_path = f"rtsps://{cctv['ip_address']}:{cctv['port']}/{cctv['token']}?enableSrtp"
        os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'
        
        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            # Fallback ke RTSP biasa seperti di detection.py
            rtsp_url = video_path.replace("rtsps://", "rtsp://").replace(":7441", ":7447")
            cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        return cap

    def capture_loop(self):
        """Thread untuk mengambil frame (capture_thread di detection.py)."""
        cap = self.open_stream()
        frame_count = 0
        
        while not self.stop_event.is_set():
            ret, frame = cap.read()
            if ret and frame is not None:
                if frame_count % FRAME_SKIP == 0:
                    self.frame_queue.append(frame.copy())
                frame_count += 1
            else:
                logging.warning(f"Gagal membaca frame, mencoba reconnect...")
                cap.release()
                time.sleep(5)
                cap = self.open_stream()
        cap.release()

    def process_loop(self):
        """Thread utama deteksi: Integrasi total dari process_thread."""
        self.model = YOLO(MODEL_PATH).to(self.device)
        
        while not self.stop_event.is_set():
            if self.frame_queue:
                try:
                    # 1. Ambil config terbaru (worker memegang config-nya sendiri)
                    roi_regions = self.cctv_config.get("roi", [])
                    json_w = self.cctv_config.get("json_width", CCTV_RATIO[0])
                    json_h = self.cctv_config.get("json_height", CCTV_RATIO[1])

                    # 2. Filter Active IDs
                    active_ids = set()
                    for region in roi_regions:
                        active_ids.update(region.get("allowed_violations", []))
                    active_ids = list(active_ids)

                    # 3. Ambil frame & Anotasi awal
                    frame = self.frame_queue.popleft()
                    annotated = frame.copy()
                    h, w = frame.shape[:2]

                    scale_x, scale_y = w / json_w, h / json_h

                    # 4. Gambar ROI
                    for region in roi_regions:
                        pts = (region["points"] * [scale_x, scale_y]).astype(np.int32).reshape((-1, 1, 2))
                        cv2.polylines(annotated, [pts], True, (0, 0, 255), 2)

                    # 5. Bangun track_classes berdasarkan active_ids dari ROI (Logika Asli)
                    track_classes = set(active_ids)
                    for viol_id in active_ids:
                        # Ambil pasangan PPE (misal: ID Orang jika ID Helm aktif)
                        ppe_id = state.PPE_VIOLATION_PAIRS.get(viol_id)
                        if ppe_id:
                            track_classes.add(ppe_id)

                    track_classes_list = list(track_classes) if active_ids else None
                    logging.info(f"[CCTV {self.cctv_id}] Active IDs from ROI: {active_ids} | Tracking: {track_classes_list}")

                    # 6. Deteksi YOLO
                    results = self.model.track(
                        frame, 
                        conf=CONFIDENCE_THRESHOLD, 
                        persist=True, 
                        tracker="bytetrack.yaml", 
                        half=(self.device == 'cuda')
                    )

                    # 7. Proses Deteksi (Sesuai Logika Asli di detection.py)
                    for r in results:
                        for box in r.boxes:
                            if box.id is None: continue
                            
                            x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                            cls_id, conf, track_id = int(box.cls[0]), float(box.conf[0]), int(box.id[0])
                            class_name = self.model.names[cls_id]

                            # Gambar Box & Label
                            color = get_color_for_class(class_name)
                            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                            cv2.putText(annotated, f"{class_name} {conf:.2f}", (x1, max(y1-10, 10)), 
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                            # Validasi Pelanggaran
                            class_info = state.OBJECT_CLASS_CACHE.get(class_name)
                            if class_info and class_info["is_violation"] and class_info["id"] in active_ids:
                                # KIRIM self.tracked_violations AGAR COOLDOWN BEKERJA
                                process_detection(
                                    self.cctv_id, frame, annotated, x1, y1, x2, y2,
                                    cls_id, conf, track_id, self.model, self.tracked_violations
                                )

                    # 8. Kirim ke Redis & Streaming
                    _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    redis_client.set(f"cctv_frame:{self.cctv_id}", buffer.tobytes(), ex=5)

                except Exception as e:
                    logging.error(f"[CCTV {self.cctv_id}] Detection Loop Error: {e}")
                
                gc.collect()
            else:
                time.sleep(0.01)

    def cleanup_loop(self):
        """Membersihkan data pelanggaran lama agar memori tidak bengkak."""
        logging.info(f"[CCTV {self.cctv_id}] Cleanup thread started.")
        while not self.stop_event.is_set():
            now = time.time()
            removed_count = 0
            for track_id in list(self.tracked_violations.keys()):
                data = self.tracked_violations[track_id]
                last_times = data.get("last_times", {})
                if not last_times:
                    continue
                
                last_seen = max(last_times.values(), default=0)
                if now - last_seen > CLEANUP_INTERVAL:
                    del self.tracked_violations[track_id]
                    removed_count += 1
            
            if removed_count > 0:
                logging.info(f"[CLEANUP {self.cctv_id}] Berhasil menghapus {removed_count} track lama.")
            
            time.sleep(CLEANUP_INTERVAL)

    def run(self):
        """Menjalankan semua komponen worker."""
        try:
            self.load_config()
            logging.info(f"Worker dimulai untuk {self.cctv_config['name']}")
            
            # Tambahkan thread cleanup di sini
            t_cap = Thread(target=self.capture_loop, daemon=True)
            t_proc = Thread(target=self.process_loop, daemon=True)
            t_clean = Thread(target=self.cleanup_loop, daemon=True) # JALANKAN CLEANUP
            
            t_cap.start()
            t_proc.start()
            t_clean.start()
            
            while not self.stop_event.is_set():
                time.sleep(1)
                
        except KeyboardInterrupt:
            self.stop_event.set()
        except Exception as e:
            logging.error(f"Worker Error: {e}")
            self.stop_event.set()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cctv_id", required=True, help="ID CCTV dari database")
    args = parser.parse_args()
    
    worker = CCTVWorker(args.cctv_id)
    worker.run()