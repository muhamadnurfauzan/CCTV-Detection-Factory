import time
import cv2
import datetime
import numpy as np
from threading import Thread
import logging
from services import notification_service
from shared import state
from services.cloud_storage import upload_violation_image
from utils.helpers import point_in_polygon
from db.db_config import get_connection
from config import (
    CONFIDENCE_THRESHOLD, COOLDOWN, TARGET_MAX_WIDTH, PADDING_PERCENT 
    )

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def log_violation_async(cctv_id, class_name, public_url, image_bytes):
    """
    Fungsi yang menjalankan semua I/O berat (DB log, Daily log, Email) di thread background.
    """
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Insert violation_detection
        cur.execute("""
            INSERT INTO violation_detection (id_cctv, id_violation, image, timestamp)
            VALUES (%s, (SELECT id FROM object_class WHERE name=%s LIMIT 1), %s, NOW() AT TIME ZONE 'Asia/Jakarta')
            RETURNING id;
        """, (cctv_id, class_name, public_url))
        violation_id = cur.fetchone()[0] # Dapatkan ID untuk notifikasi

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
        logging.info(f"[DB LOG] SUCCESS → Violation ID: {violation_id} | Daily log updated")

        # Kirim email otomatis (Sudah di thread terpisah)
        if state.GLOBAL_EMAIL_CONFIG.get('enable_auto_email', False): 
            Thread(target=notification_service.notify_user_by_violation_id, 
                   args=(violation_id,), daemon=True).start()
            logging.info(f"[EMAIL] Notifikasi otomatis dikirim (Violation ID: {violation_id})")

    except Exception as e:
        logging.error(f"[DB LOG] GAGAL: {e}")
    finally:
        if cur: cur.close()
        if conn: conn.close()

def upload_and_log_violation(cctv_id, class_name, image_bytes):
    """Mengelola Upload Supabase dan memanggil log DB asinkron."""
    try:
        # --- BLOKIR PALING LAMA ---
        public_url = upload_violation_image(image_bytes, cctv_id, class_name)
        
        # Panggil I/O DB di thread baru, ini adalah thread utama I/O yang lambat
        Thread(target=log_violation_async, 
               args=(cctv_id, class_name, public_url, image_bytes), 
               daemon=True).start()
    except Exception as e:
        logging.error(f"[CCTV {cctv_id}] UPLOAD GAGAL/LOG GAGAL: {e}")

def process_detection(cctv_id, frame, annotated, x1, y1, x2, y2, cls_id, conf, track_id, model, tracked_violations):
    """
    Proses satu deteksi violation: crop → polaroid → siapkan data I/O.
    Semua validasi dan I/O (DB, Upload, Email) dijalankan di thread terpisah.
    """
    cctv_cfg = state.cctv_configs[cctv_id]
    roi_regions = cctv_cfg["roi"]
    location = cctv_cfg["location"]
    class_name = model.names[int(cls_id)]

    # --- 1. Cek ROI, Confidence, Cooldown (Logika sudah benar) ---
    center = ((x1 + x2) // 2, (y1 + y2) // 2)
    
    # Cek ROI
    if not any(point_in_polygon(center, r["points"]) for r in roi_regions):
        print(f"[VIOLATION] SKIP → {class_name} di luar ROI")
        return

    # Cek Confidence
    if conf < CONFIDENCE_THRESHOLD:
        print(f"[VIOLATION] SKIP → Confidence {conf:.2f} < {CONFIDENCE_THRESHOLD}")
        return

    # Cooldown Check
    now = time.time()
    data = tracked_violations.setdefault(track_id, {"last_times": {}})
    last_time = data["last_times"].get(class_name, 0)
    if now - last_time < COOLDOWN:
        print(f"[VIOLATION] SKIP → Cooldown aktif ({now - last_time:.1f}s)")
        return
    
    # --- 2. Crop, Resize, Polaroid ---
    h, w = frame.shape[:2]
    pad_w = int((x2 - x1) * PADDING_PERCENT)
    pad_h = int((y2 - y1) * PADDING_PERCENT)
    x1e = max(0, x1 - pad_w)
    y1e = max(0, y1 - pad_h)
    x2e = min(w, x2 + pad_w)
    y2e = min(h, y2 + pad_h)
    crop = frame[y1e:y2e, x1e:x2e]

    if crop.size == 0:
        print(f"[VIOLATION] SKIP → Crop kosong")
        return

    # Resize jika terlalu kecil
    if crop.shape[1] < TARGET_MAX_WIDTH:
        scale = TARGET_MAX_WIDTH / crop.shape[1]
        new_h = int(crop.shape[0] * scale)
        crop = cv2.resize(crop, (TARGET_MAX_WIDTH, new_h))

    # Buat Polaroid
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

    # Encode ke JPEG
    success, buffer = cv2.imencode(".jpg", polaroid, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not success:
        print(f"[CCTV {cctv_id}] GAGAL → Encode gambar gagal")
        return
    image_bytes = buffer.tobytes()

    # --- 3. Panggil Upload dan Logging Asinkron ---
    
    # Update cooldown sebelum I/O
    data["last_times"][class_name] = now 
    
    # Panggil upload and logging ASINKRON (Tidak memblokir process thread!)
    Thread(target=upload_and_log_violation, 
           args=(cctv_id, class_name, image_bytes), 
           daemon=True).start()
    
    # PENTING: RETURN SEGERA. Process thread akan melanjutkan ke frame_queue.pop() berikutnya.
    return