import time
import cv2
import gc
import datetime
import numpy as np
from ultralytics import YOLO
from threading import Thread
from collections import deque
from threading import Event
import logging
import config
from cloud_storage import upload_violation_image
from db.db_config import get_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# --- ASUMSI DUMMY FUNCTION ---
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

# --- FUNGSI GENERIK UNTUK MERESET POSTGRESQL SEQUENCE ---
def reset_table_sequence(table_name):
    """
    Memastikan auto-increment ID tabel (SERIAL) dimulai setelah nilai MAX(id) yang ada.
    Dijalankan sekali saat aplikasi startup untuk menghindari masalah duplicate key setelah migrasi data.
    """
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # Nama sequence di PostgreSQL adalah <nama_tabel>_<nama_kolom>_seq
        sequence_name = f"{table_name}_id_seq" 

        # Kueri setval(nama_sequence, max_id, true)
        # COALESCE(MAX(id), 1) memastikan setidaknya mulai dari 1 jika tabel kosong
        cur.execute(f"""
            SELECT setval('{sequence_name}', COALESCE(MAX(id), 1), true) 
            FROM {table_name};
        """)
        new_val = cur.fetchone()[0]
        conn.commit()
        print(f"[DB INIT] Sequence for {table_name} reset to: {new_val}")
        return True
    except Exception as e:
        # Pengecualian: sequence mungkin tidak ada jika tabel tidak punya SERIAL id
        print(f"[DB INIT] Gagal me-reset sequence ID untuk {table_name}: {e}")
        return False
    finally:
        if cur: cur.close()
        if conn: conn.close()

# --- EKSEKUSI GLOBAL UNTUK SEMUA TABEL STATIS/DINAMIS DENGAN SERIAL ID ---
# Dijalankan saat modul ini diimpor (yaitu saat app.py dimulai)
reset_table_sequence('violation_detection')
reset_table_sequence('cctv_data')

def open_stream(cctv, max_retries=5, retry_delay=1):
    video_path = f"rtsps://{cctv['ip_address']}:{cctv['port']}/{cctv['token']}?enableSrtp"
    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        print(f"[{cctv['name']}] Gagal RTSPS, fallback RTSP...")
        rtsp_url = video_path.replace("rtsps://", "rtsp://").replace(":7441", ":7447")
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            print(f"[{cctv['name']}] Tidak dapat membuka stream.")
            return None
    return cap

def reconnect_cap(cctv, max_retries=5, retry_delay=1):
    """Reconnect cap dengan backoff"""
    for attempt in range(max_retries):
        print(f"[{cctv['name']}] Reconnecting stream (attempt {attempt + 1}/{max_retries})...")
        cap.release()
        time.sleep(retry_delay * (2 ** attempt))  # Exponential backoff
        cap = open_stream(cctv)
        if cap and cap.isOpened():
            print(f"[{cctv['name']}] Reconnected successfully.")
            return cap
    print(f"[{cctv['name']}] Failed to reconnect after {max_retries} attempts.")
    return None

def process_detection(cctv_id, frame, annotated, x1, y1, x2, y2, cls_id, conf, track_id, model, tracked_violations):
    """
    Proses satu deteksi violation: crop → polaroid → upload → simpan ke DB.
    Semua validasi (class aktif, is_violation) SUDAH dilakukan di process_thread.
    """
    cctv_cfg = config.cctv_configs[cctv_id]
    roi_regions = cctv_cfg["roi"]
    location = cctv_cfg["location"]
    class_name = model.names[int(cls_id)]

    # --- 1. Cek ROI ---
    center = ((x1 + x2) // 2, (y1 + y2) // 2)
    if not any(point_in_polygon(center, r["points"]) for r in roi_regions):
        print(f"[VIOLATION] SKIP → {class_name} di luar ROI")
        return

    # --- 2. Cek Confidence ---
    if conf < config.CONFIDENCE_THRESHOLD:
        print(f"[VIOLATION] SKIP → Confidence {conf:.2f} < {config.CONFIDENCE_THRESHOLD}")
        return

    # --- 3. Cooldown Check ---
    now = time.time()
    data = tracked_violations.setdefault(track_id, {"last_times": {}})
    last_time = data["last_times"].get(class_name, 0)
    if now - last_time < config.COOLDOWN:
        print(f"[VIOLATION] SKIP → Cooldown aktif ({now - last_time:.1f}s)")
        return
    data["last_times"][class_name] = now

    # --- 4. Crop dengan Padding ---
    h, w = frame.shape[:2]
    pad_w = int((x2 - x1) * config.PADDING_PERCENT)
    pad_h = int((y2 - y1) * config.PADDING_PERCENT)
    x1e = max(0, x1 - pad_w)
    y1e = max(0, y1 - pad_h)
    x2e = min(w, x2 + pad_w)
    y2e = min(h, y2 + pad_h)
    crop = frame[y1e:y2e, x1e:x2e]

    if crop.size == 0:
        print(f"[VIOLATION] SKIP → Crop kosong")
        return

    # --- 5. Resize jika terlalu kecil ---
    if crop.shape[1] < config.TARGET_MAX_WIDTH:
        scale = config.TARGET_MAX_WIDTH / crop.shape[1]
        new_h = int(crop.shape[0] * scale)
        crop = cv2.resize(crop, (config.TARGET_MAX_WIDTH, new_h))

    # --- 6. Buat Polaroid ---
    label_height = 80
    polaroid = np.ones((crop.shape[0] + label_height, crop.shape[1], 3), dtype=np.uint8) * 255
    polaroid[:crop.shape[0], :] = crop

    texts = [
        class_name.upper(),
        datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        location
    ]
    y_pos = crop.shape[0] + 20
    for text in texts:
        cv2.putText(polaroid, text, (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1)
        y_pos += 22

    # --- 7. Encode ke JPEG ---
    success, buffer = cv2.imencode(".jpg", polaroid, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not success:
        print(f"[CCTV {cctv_id}] GAGAL → Encode gambar gagal")
        return
    image_bytes = buffer.tobytes()

    # --- 8. Upload ke Supabase ---
    try:
        public_url = upload_violation_image(image_bytes, cctv_id, class_name)
        # print(f"[CCTV {cctv_id}] UPLOAD → {class_name} berhasil: {public_url}")
    except Exception as e:
        print(f"[CCTV {cctv_id}] UPLOAD GAGAL → {e}")
        return

    # --- 9. Simpan ke PostgreSQL ---
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Insert violation_detection
        cur.execute("""
            INSERT INTO violation_detection (id_cctv, id_violation, image, timestamp)
            VALUES (%s, (SELECT id FROM object_class WHERE name=%s LIMIT 1), %s, NOW() AT TIME ZONE 'Asia/Jakarta')
            RETURNING id;
        """, (cctv_id, class_name, public_url))
        violation_id = cur.fetchone()[0]

        # Update violation_daily_log
        cur.execute("""
            INSERT INTO violation_daily_log (log_date, id_cctv, id_violation, total_violation, latest_update)
            VALUES (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta', %s, 
                    (SELECT id FROM object_class WHERE name=%s LIMIT 1), 1, NOW() AT TIME ZONE 'Asia/Jakarta')
            ON CONFLICT (log_date, id_cctv, id_violation)
            DO UPDATE SET 
                total_violation = violation_daily_log.total_violation + 1,
                latest_update = EXCLUDED.latest_update;
        """, (cctv_id, class_name))

        conn.commit()
        print(f"[DB] SUCCESS → Violation ID: {violation_id} | Daily log updated")
    except Exception as e:
        print(f"[DB] GAGAL → {e}")
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()
    cctv_cfg = config.cctv_configs[cctv_id]
    roi_regions = cctv_cfg["roi"]
    location = cctv_cfg["location"]
    class_name = model.names[int(cls_id)]

    # Cek ROI dan confidence (hapus PPE_CLASSES residu)
    center = ((x1 + x2)//2, (y1 + y2)//2)
    if not any(point_in_polygon(center, r["points"]) for r in roi_regions):
        print(f"[VIOLATION] SKIP: {class_name} di luar ROI")
        return
    if conf < config.CONFIDENCE_THRESHOLD:
        print(f"[VIOLATION] SKIP: Confidence {conf:.2f} < {config.CONFIDENCE_THRESHOLD}")
        return

    # Cooldown check
    now = time.time()
    data = tracked_violations.setdefault(track_id, {"last_times": {}})
    last_time = data["last_times"].get(class_name, 0)
    if now - last_time < config.COOLDOWN:
        return

    # Crop area
    h, w = frame.shape[:2]
    pad_w, pad_h = int((x2-x1)*config.PADDING_PERCENT), int((y2-y1)*config.PADDING_PERCENT)
    x1e, y1e = max(0, x1-pad_w), max(0, y1-pad_h)
    x2e, y2e = min(w, x2+pad_w), min(h, y2+pad_h)
    crop = frame[y1e:y2e, x1e:x2e]
    if crop.size == 0:
        return
    if crop.shape[1] < config.TARGET_MAX_WIDTH:
        scale = config.TARGET_MAX_WIDTH / crop.shape[1]
        crop = cv2.resize(crop, (config.TARGET_MAX_WIDTH, int(crop.shape[0]*scale)))

    # --- Tambahkan label seperti polaroid ---
    polaroid = np.ones((crop.shape[0]+80, crop.shape[1], 3), dtype=np.uint8)*255
    polaroid[:crop.shape[0], :] = crop
    y_pos = crop.shape[0] + 20
    for text in [class_name, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), location]:
        cv2.putText(polaroid, text, (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,0), 1)
        y_pos += 25

    # --- Encode ke bytes untuk upload ---
    success, buffer = cv2.imencode(".jpg", polaroid)
    if not success:
        print(f"[CCTV {cctv_id}] Gagal encode gambar.")
        return
    image_bytes = buffer.tobytes()

    # --- Upload ke Supabase Storage ---
    try:
        public_url = upload_violation_image(image_bytes, cctv_id, class_name)
        print(f"[CCTV {cctv_id}] Upload image {class_name} berhasil.")
    except Exception as e:
        print(f"[CCTV {cctv_id}] Upload ke Supabase gagal: {e}")
        return

    # --- Simpan log + update daily log ---
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Simpan violation_detection (PostgreSQL)
        cur.execute("""
            INSERT INTO violation_detection (id_cctv, id_violation, image, timestamp)
            VALUES (%s, (SELECT id FROM object_class WHERE name=%s LIMIT 1), %s, NOW() AT TIME ZONE 'Asia/Jakarta')
            RETURNING id; 
        """, (cctv_id, class_name, public_url))
        
        # PostgreSQL tidak punya ON DUPLICATE KEY UPDATE → pakai ON CONFLICT
        cur.execute("""
            INSERT INTO violation_daily_log (log_date, id_cctv, id_violation, total_violation, latest_update)
            VALUES (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta', %s, (SELECT id FROM object_class WHERE name=%s LIMIT 1), 1, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')
            ON CONFLICT (log_date, id_cctv, id_violation)
            DO UPDATE SET 
                total_violation = violation_daily_log.total_violation + 1,
                latest_update = EXCLUDED.latest_update;
        """, (cctv_id, class_name))

        conn.commit()
        cur.close()
        conn.close()

        print(f"[CCTV {cctv_id}] Violation logged & daily count updated (PostgreSQL).")
    except Exception as e:
        print(f"[DB] Gagal update log violation/daily: {e}")

    data["last_times"][class_name] = now

def capture_thread(cctv_id, frame_queue, stop_event):
    cctv = config.cctv_configs[cctv_id]
    cap = open_stream(cctv)
    if not cap:
        logging.error(f"[{cctv_id}] Thread exit: Initial stream failed.")
        return 

    fail_count = 0
    max_fails = 10
    frame_count = 0
    
    while not stop_event.is_set():
        ret, frame = cap.read()
        
        if not ret:
            fail_count += 1
            print(f"[{cctv_id}] Frame read failed ({fail_count}/{max_fails}).")
            
            if fail_count >= max_fails:
                cap.release() 
                cap = reconnect_cap(cctv)
        
                if not cap:
                    if stop_event.is_set(): break
                    time.sleep(5) 
                    continue
                
                fail_count = 0
            continue 

        if stop_event.is_set(): break

        fail_count = 0        
        if frame_count % config.FRAME_SKIP == 0:
            frame_queue.append(frame)
        frame_count += 1

    cap.release()
    logging.info(f"[{cctv_id}] Capture thread finished.")

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
            if now - last_seen > config.CLEANUP_INTERVAL:
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
        time.sleep(config.CLEANUP_INTERVAL)

def process_thread(cctv_id, frame_queue, stop_event):
    """
    Thread utama: ambil frame → deteksi → gambar anotasi → proses violation.
    """
    tracked_violations = {}
    model = YOLO(config.MODEL_PATH).to("cpu")

    # Start cleanup thread
    Thread(target=cleanup_thread, args=(tracked_violations,), daemon=True).start()

    roi_regions = config.cctv_configs[cctv_id]["roi"]

    while not stop_event.is_set():
        if not frame_queue:
            time.sleep(0.02)
            continue
        if stop_event.is_set(): break
        frame = frame_queue.pop()
        annotated = frame.copy()

        # --- Gambar ROI ---
        for region in roi_regions:
            pts = np.array(region["points"], np.int32).reshape((-1, 1, 2))
            cv2.polylines(annotated, [pts], True, (0, 255, 255), 2)
            cv2.putText(annotated, region.get("name", "ROI"), tuple(pts[0][0]),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        # --- Ambil active violation IDs ---
        active_ids = config.get_active_violation_ids_for_cctv(cctv_id)

        # --- Bangun track_classes: violation aktif + pasangan PPE ---
        track_classes = set()

        # Tambahkan violation aktif
        track_classes.update(active_ids)

        # Tambahkan pasangan PPE
        for viol_id in active_ids:
            ppe_id = config.PPE_VIOLATION_PAIRS.get(viol_id)
            if ppe_id:
                track_classes.add(ppe_id)

        # Jika tidak ada violation aktif → deteksi semua
        if not active_ids:
            track_classes = None
        else:
            track_classes = list(track_classes)

        print(f"[CCTV {cctv_id}] Active IDs: {active_ids} | Tracking: {track_classes}")

        try:
            results = model.track(
                frame,
                conf=config.CONFIDENCE_THRESHOLD,
                persist=True,
                tracker="bytetrack.yaml",
                # classes=track_classes
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

                    # Gambar bounding box
                    color = config.get_color_for_class(class_name)
                    cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(annotated, f"{class_name} {conf:.2f}",
                                (x1, max(y1 - 10, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                    # --- VALIDASI VIOLATION ---
                    class_info = config.OBJECT_CLASS_CACHE.get(class_name)
                    if not class_info:
                        print(f"[SKIP] Class tidak dikenal: {class_name}")
                        continue

                    if not class_info["is_violation"]:
                        print(f"[SKIP] {class_name} bukan violation")
                        continue

                    if class_info["id"] not in active_ids:
                        print(f"[SKIP] {class_name} TIDAK AKTIF di CCTV {cctv_id} (ID: {class_info['id']})")
                        continue

                    process_detection(
                        cctv_id, frame, annotated, x1, y1, x2, y2,
                        cls_id, conf, track_id, model, tracked_violations
                    )

        except Exception as e:
            print(f"[CCTV {cctv_id}] DETECTION ERROR → {e}")

        # Simpan frame teranotasi
        config.annotated_frames[cctv_id] = annotated
        gc.collect()

def start_detection_for_cctv(cctv_id):
    """Memulai thread deteksi untuk CCTV ID tertentu."""
    # Hentikan yang lama dulu (jika thread restart)
    stop_detection_for_cctv(cctv_id) 

    if cctv_id not in config.cctv_configs or not config.cctv_configs[cctv_id].get('enabled'):
        return

    cctv_config = config.cctv_configs[cctv_id]
    
    # --- TAMBAHAN BARU ---
    stop_event = Event()
    config.detection_threads[cctv_id] = {'stop_event': stop_event, 'threads': []}
    # --------------------

    config.annotated_frames[cctv_id] = np.zeros((480, 640, 3), dtype=np.uint8)
    frame_queue = deque(maxlen=config.QUEUE_SIZE)
    
    t1 = Thread(target=capture_thread, args=(cctv_id, frame_queue, stop_event), daemon=True)
    t2 = Thread(target=process_thread, args=(cctv_id, frame_queue, stop_event), daemon=True)

    t1.start(); t2.start()
    
    config.detection_threads[cctv_id]['threads'].extend([t1, t2])
    logging.info(f"[THREAD] Started detection threads for CCTV {cctv_id}.")


def stop_detection_for_cctv(cctv_id):
    """Menghentikan thread deteksi untuk CCTV ID tertentu."""
    if cctv_id in config.detection_threads:
        info = config.detection_threads.pop(cctv_id)
        info['stop_event'].set() # Mengirim sinyal stop
        logging.info(f"[THREAD] Stopped detection threads for CCTV {cctv_id}.")
        # Note: Thread akan selesai setelah sinyal set dan loop-nya di-cek.

def stop_all_detections():
    """Mengirim sinyal penghentian ke semua thread deteksi yang aktif."""
    # Iterasi melalui salinan keys karena detection_threads akan dimodifikasi
    for cctv_id in list(config.detection_threads.keys()):
        # Memanggil fungsi stop untuk setiap CCTV ID
        stop_detection_for_cctv(cctv_id)
    
    # Tunggu sebentar (opsional) agar thread memiliki waktu untuk berhenti
    time.sleep(0.5)
    logging.info("[THREAD] All detection threads signaled to stop.")

def start_all_detections():
    """Memulai semua thread deteksi untuk CCTV aktif saat startup."""
    threads = []
    
    # Bersihkan thread lama jika ada
    # Lakukan stop thread yang masih berjalan jika ada, meskipun ini dipanggil saat startup
    stop_all_detections() 
    
    for cctv_id, cctv_config in config.cctv_configs.items():
        if cctv_config['enabled']:
            # --- TAMBAHAN BARU ---
            stop_event = Event() # Buat sinyal penghentian
            config.detection_threads[cctv_id] = {'stop_event': stop_event, 'threads': []}
            # --------------------
            
            config.annotated_frames[cctv_id] = np.zeros((480, 640, 3), dtype=np.uint8) 
            frame_queue = deque(maxlen=config.QUEUE_SIZE)
            
            t1 = Thread(target=capture_thread, args=(cctv_id, frame_queue, stop_event), daemon=True) # <-- Kirim stop_event
            t2 = Thread(target=process_thread, args=(cctv_id, frame_queue, stop_event), daemon=True) # <-- Kirim stop_event
            
            t1.start(); t2.start()
            
            config.detection_threads[cctv_id]['threads'].extend([t1, t2])
            threads.append((t1, t2))
            
    return threads