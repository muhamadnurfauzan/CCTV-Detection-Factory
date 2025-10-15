# utils.py
import cv2
import datetime
import numpy as np
import logging
import os

from config import VIDEO_PATH, roi_regions, ppe_colors, PPE_CLASSES, PADDING_PERCENT, TARGET_MAX_WIDTH, LOCATION, COOLDOWN, OUTPUT_DIR

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

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
    logging.info(f"Deteksi: {class_name} (conf: {conf:.2f}, track_id: {track_id}) at ({x1}, {y1}, {x2}, {y2})")
    
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
                logging.info(f"Crop berhasil untuk {class_name} pada track {track_id}")
            except Exception as e:
                logging.error(f"Error cropping: {e}")
                return
            
            if violation_crop.shape[1] < TARGET_MAX_WIDTH:
                try:
                    scale_factor = TARGET_MAX_WIDTH / violation_crop.shape[1]
                    new_height = int(violation_crop.shape[0] * scale_factor)
                    violation_crop = cv2.resize(violation_crop, (TARGET_MAX_WIDTH, new_height), interpolation=cv2.INTER_CUBIC)  # Ubah ke INTER_CUBIC untuk kualitas lebih baik
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
                    cv2.imwrite(filename, polaroid, [cv2.IMWRITE_JPEG_QUALITY, 95])  # Naikkan quality ke 95 untuk kurangi kompresi
                    logging.info(f"Pelanggaran {class_name} pada {track_id} disimpan: {filename}")
                    
                    tracked_violations[track_id]['last_times'][class_name] = current_real_time
                    tracked_violations[track_id]['last_video_times'][class_name] = video_time
                except Exception as e:
                    logging.error(f"Error simpan polaroid: {e}")
                    return
    
    # Gambar bounding box pada annotated_frame_local (fix bug)
    color = ppe_colors.get(class_name, (0, 0, 0))
    cv2.rectangle(annotated_frame_local, (x1, y1), (x2, y2), color, 2)
    cv2.putText(annotated_frame_local, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)