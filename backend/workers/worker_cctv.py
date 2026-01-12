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

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)

if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Import dari modul yang sudah ada
from shared_state import state
import services.config_service as config_service
from services.cctv_services import load_all_cctv_configs, get_active_model_from_db
from core.violation_processor import process_detection
from core.violation_gate import ViolationGate
from core.cctv_scheduler import is_cctv_active_now
from utils.helpers import get_color_for_class, point_in_polygon
from config import (
    CONFIDENCE_THRESHOLD, QUEUE_SIZE, FRAME_SKIP, CLEANUP_INTERVAL, CCTV_RATIO
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
        self.violation_gate = ViolationGate(ttl=CLEANUP_INTERVAL)
        self.cctv_config = None
        self.model = None
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.frame_count = 0

    def should_call_processor(self, track_id, class_id, roi_name):
        gate = self.violation_gate.setdefault(track_id, set())
        key = (class_id, roi_name)

        if key in gate:
            return False

        gate.add(key)
        return True

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
        """Membuka stream RTSP dengan validasi ketat."""
        cctv = self.cctv_config
        video_path = f"rtsps://{cctv['ip_address']}:{cctv['port']}/{cctv['token']}?enableSrtp"
        os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|stimeout;5000000'
        
        logging.info(f"[CCTV {self.cctv_id}] Connecting to: {video_path}")
        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
        
        if not cap.isOpened():
            # Fallback ke RTSP biasa
            rtsp_url = video_path.replace("rtsps://", "rtsp://").replace(":7441", ":7447")
            logging.info(f"[CCTV {self.cctv_id}] Fallback to: {rtsp_url}")
            cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
            
        if not cap.isOpened():
            # Jika tetap gagal, lempar error agar PM2 mengambil alih
            raise ConnectionError(f"Gagal membuka stream untuk CCTV ID {self.cctv_id}")
            
        return cap

    def capture_loop(self):
        """Thread pengambilan frame."""
        try:
            cap = self.open_stream()
            consecutive_failures = 0
            
            while not self.stop_event.is_set():
                ret, frame = cap.read()
                if ret and frame is not None:
                    consecutive_failures = 0
                    if self.frame_count % FRAME_SKIP == 0:
                        self.frame_queue.append(frame.copy())
                    self.frame_count += 1
                else:
                    consecutive_failures += 1
                    if consecutive_failures > 10:
                        logging.error(f"[CCTV {self.cctv_id}] Stream terputus permanen.")
                        break
                time.sleep(0.001)
        except Exception as e:
            logging.error(f"[FATAL CAPTURE] {e}")
        finally:
            # PAKSA MATI: Jika thread ini berhenti, matikan seluruh proses
            logging.info("Mematikan seluruh proses worker...")
            os._exit(1)

    def process_loop(self):
        """Thread utama deteksi dengan mode Dual: Stream Only vs Full Detection."""
        state.active_model_filename = get_active_model_from_db()
        with state.MODEL_LOCK:
            self.current_model_file = state.active_model_filename
        model_path = os.path.join("model", self.current_model_file)
        self.model = YOLO(model_path).to(self.device)
        logging.info(f"[CCTV {self.cctv_id}] Model loaded: {self.current_model_file} on {self.device}")
        
        while not self.stop_event.is_set():
            if self.frame_queue:
                try:
                    frame = self.frame_queue.popleft()
                    target_w, target_h = CCTV_RATIO[0], CCTV_RATIO[1]
                    frame = cv2.resize(frame, (target_w, target_h))
                    
                    annotated = frame.copy()
                    active_by_schedule = is_cctv_active_now(self.cctv_id)
                    
                    roi_raw = self.cctv_config.get("roi", {})
                    
                    # Standarisasi: Pastikan kita punya dict untuk metadata dan list untuk loop
                    if isinstance(roi_raw, dict) and "items" in roi_raw:
                        roi_list = roi_raw["items"]
                        json_w = roi_raw.get("image_width", 2688) 
                        json_h = roi_raw.get("image_height", 1512)
                    else:
                        roi_list = roi_raw if isinstance(roi_raw, list) else []
                        json_w = 2688 
                        json_h = 1512

                    if active_by_schedule and roi_list:
                        scale_x = target_w / json_w
                        scale_y = target_h / json_h
                        
                        # 1. Pre-calculate scaled ROI points 
                        processed_rois = []
                        for region in roi_list:
                            area_name = region.get("name", "Unknown Area")
                            points = np.array(region["points"])
                            scaled_pts = (points * [scale_x, scale_y]).astype(np.int32)
                            
                            allowed = region.get("allowed_violations", [])
                            processed_rois.append({
                                "name": area_name,
                                "points": scaled_pts,
                                "allowed": allowed
                            })
                            
                            print(f"[CCTV {self.cctv_id}] ROI: {area_name} | Violation(s) allowed: {allowed}")
                            
                            cv2.polylines(annotated, [scaled_pts.reshape((-1, 1, 2))], True, (0, 0, 255), 2)

                        # 2. Jalankan YOLO
                        results = self.model.track(
                            frame, 
                            conf=CONFIDENCE_THRESHOLD, 
                            persist=True, 
                            tracker="bytetrack.yaml", 
                            half=(self.device == 'cuda')
                        )

                        # 3. Loop Objek
                        for r in results:
                            for box in r.boxes:
                                if box.id is None: continue
                                x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                                cls_id, conf, track_id = int(box.cls[0]), float(box.conf[0]), int(box.id[0])
                                class_name = self.model.names[cls_id]
                                class_info = state.OBJECT_CLASS_CACHE.get(class_name)
                                
                                if not class_info: continue
                                center = ((x1 + x2) // 2, (y1 + y2) // 2)

                                # Drawing box
                                color = get_color_for_class(class_name)
                                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                                cv2.putText(annotated, f"{track_id} {class_name} {conf:.2f}", (x1, max(y1-10, 10)), 
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                                # 4. Cek ROI
                                matched_roi = None
                                for roi in processed_rois:
                                    if point_in_polygon(center, roi["points"]):
                                        matched_roi = roi
                                        break 
                                
                                if matched_roi is not None:
                                    if class_info["id"] in matched_roi["allowed"]:
                                        cx, cy = center
                                        spatial_key = (cx // 300, cy // 300) 
                                        gate_key = (
                                            self.cctv_id, 
                                            cls_id, 
                                            matched_roi["name"], 
                                            track_id, 
                                            spatial_key
                                        )

                                        if self.violation_gate.should_report(gate_key):
                                            process_detection(
                                                self.cctv_id,
                                                frame,
                                                annotated,
                                                x1, y1, x2, y2,
                                                cls_id,
                                                conf,
                                                self.model,
                                                track_id=track_id,
                                                tracked_violations=self.tracked_violations,
                                                location=f"{self.cctv_config['location']} - {matched_roi['name']}"
                                            )
                                
                    else:
                        # --- [B] MODE STREAM ONLY (Outside Schedule / No ROI) ---
                        # Menambahkan label status pada frame agar user tahu alasannya
                        status_msg = "STREAMING ONLY (Outside Schedule)" if not active_by_schedule else "STREAMING ONLY (No ROI set)"
                        cv2.putText(annotated, status_msg, (20, 1440), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                        
                    # 4. SELALU Kirim ke Redis agar frontend tidak freeze
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
    
    def listen_for_updates(self):
        """Thread untuk mendengarkan perubahan konfigurasi dari Redis."""
        pubsub = redis_client.pubsub()
        pubsub.subscribe('cctv_config_updated')
        logging.info(f"[CCTV {self.cctv_id}] Listening for config updates...")
        
        for message in pubsub.listen():
            if message['type'] == 'message':
                updated_id = int(message['data'])
                if updated_id == self.cctv_id:
                    logging.info(f"[CCTV {self.cctv_id}] Refreshing configuration...")
                    try:
                        self.load_config() # Panggil ulang fungsi load_config
                        logging.info(f"[CCTV {self.cctv_id}] Configuration updated successfully.")
                    except Exception as e:
                        logging.error(f"Failed to reload config: {e}")

    def run(self):
        """Menjalankan semua komponen worker dengan pengawasan ketat."""
        try:
            self.load_config()
            logging.info(f"Worker dimulai untuk {self.cctv_config['name']}")
            
            # Mendefinisikan thread
            t_cap = Thread(target=self.capture_loop, daemon=True, name="CapThread")
            t_proc = Thread(target=self.process_loop, daemon=True, name="ProcThread")
            t_clean = Thread(target=self.cleanup_loop, daemon=True, name="CleanThread")
            t_listen = Thread(target=self.listen_for_updates, daemon=True, name="ListenThread")
            
            t_cap.start()
            t_proc.start()
            t_clean.start()
            t_listen.start()
            
            last_count = 0
            last_check_time = time.time()

            while not self.stop_event.is_set():
                current_time = time.time()
                
                # Cek setiap 15 detik jika frame tidak bertambah
                if current_time - last_check_time > 15:
                    if self.frame_count == last_count:
                        logging.error(f"[CCTV {self.cctv_id}] Frame macet selama 15 detik! Memaksa restart...")
                        os._exit(1) 
                    
                    last_count = self.frame_count
                    last_check_time = current_time

                if not t_cap.is_alive() or not t_proc.is_alive():
                    logging.error("Thread vital mati!")
                    os._exit(1)
                    
                time.sleep(2)
                                
        except KeyboardInterrupt:
            logging.info("Berhenti via KeyboardInterrupt...")
            self.stop_event.set()
            os._exit(0) # Keluar normal
        except Exception as e:
            logging.error(f"Worker Fatal Error: {e}")
            os._exit(1) # Keluar dengan error agar PM2 restart

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cctv_id", required=True, help="ID CCTV dari database")
    args = parser.parse_args()
    
    worker = CCTVWorker(args.cctv_id)
    worker.run()