import cv2
import time
import logging
import redis
import numpy as np

from flask import Blueprint, request, Response, jsonify
from psycopg2.extras import RealDictCursor

from db.db_config import get_connection
from utils.auth import require_role
import services.config_service as config_service
from shared_state import state

r = redis.Redis(host='localhost', port=6379, db=0)
misc_bp = Blueprint('misc', __name__, url_prefix='/api')

@misc_bp.route("/video-feed")
@require_role(['super_admin', 'report_viewer', 'viewer'])
def video_feed():
    cctv_id = int(request.args.get("id", 1))

    def gen():
        # Menyiapkan frame placeholder jika kamera offline
        placeholder_disconnected = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(placeholder_disconnected, "Camera Offline/Freeze", (30, 240),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        
        # Encode placeholder ke JPEG sekali saja untuk efisiensi
        _, placeholder_jpeg = cv2.imencode('.jpg', placeholder_disconnected)
        placeholder_bytes = placeholder_jpeg.tobytes()

        while True:
            # Mengambil byte gambar dari Redis berdasarkan ID CCTV
            # Key format: cctv_frame:[id] (sesuai dengan yang di-set di worker)
            frame_bytes = r.get(f"cctv_frame:{cctv_id}")

            if frame_bytes:
                # Jika data ada di Redis, kirim ke frontend
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            else:
                # Jika data kosong (worker mati atau key expired), kirim placeholder
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + placeholder_bytes + b'\r\n')

            # Berikan sedikit jeda untuk mengontrol FPS stream (sekitar 10-15 FPS)
            time.sleep(0.07)

    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

@misc_bp.route('/settings', methods=['GET', 'POST'])
@require_role(['super_admin'])
def handle_settings():
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        if request.method == 'GET':
            # Ambil satu-satunya baris konfigurasi
            cur.execute("""
                SELECT smtp_host, smtp_port, smtp_user, smtp_from, enable_auto_email 
                FROM email_settings
                LIMIT 1;
            """)
            settings = cur.fetchone() or {}
            
            # Jangan kirim smtp_pass ke frontend untuk keamanan, kirim saja placeholder
            if settings and 'smtp_pass' in settings:
                settings['smtp_pass'] = '********' 
                
            return jsonify(settings)

        elif request.method == 'POST':
            data = request.json
            
            # --- 1. Dapatkan Sandi Lama DULU ---
            cur.execute("SELECT smtp_pass FROM email_settings WHERE id = 1;")
            current_pass = cur.fetchone()['smtp_pass']
            
            # --- 2. Tentukan Sandi Yang Akan Di-Update ---
            new_password_to_save = data.get('smtp_pass_new') 
            password_to_use = new_password_to_save if new_password_to_save else current_pass
            
            # --- 3. Lakukan UPDATE ---
            cur.execute("""
                UPDATE email_settings 
                SET 
                    smtp_host = %s, 
                    smtp_port = %s, 
                    smtp_user = %s, 
                    smtp_pass = %s, 
                    smtp_from = %s, 
                    enable_auto_email = %s
                WHERE id = 1; 
            """, (
                data.get('smtp_host'), 
                data.get('smtp_port'), 
                data.get('smtp_user'), 
                password_to_use,  
                data.get('smtp_from'), 
                data.get('enable_auto_email', False)
            ))
            conn.commit()
            
            # Refresh config di memori setelah disimpan ke DB
            config_service.load_email_config() 
            
            return jsonify({"success": True, "message": "Configuration successfully saved and applied."})

    except Exception as e:
        conn.rollback()
        logging.error(f"[SETTINGS API ERROR]: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@misc_bp.route('/detection-settings', methods=['GET', 'POST'])
@require_role(['super_admin'])
def detection_settings():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if request.method == 'GET':
            cur.execute("SELECT key, value, description, min_value, max_value FROM detection_settings ORDER BY key")
            return jsonify(cur.fetchall())

        else:  # POST
            data = request.json
            for item in data:
                cur.execute("""
                    UPDATE detection_settings 
                    SET value = %s
                    WHERE key = %s
                """, (item['value'], item['key']))
            conn.commit()
            
            # Reload ke memory
            from services.config_service import load_detection_settings
            load_detection_settings()
            
            return jsonify({"success": True})
    finally:
        cur.close()
        conn.close()