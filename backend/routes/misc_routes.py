import cv2
import time
import logging
import numpy as np

from flask import Blueprint, request, Response, jsonify
from psycopg2.extras import RealDictCursor

from db.db_config import get_connection
import services.config_service as config_service
from shared import state

misc_bp = Blueprint('misc', __name__, url_prefix='/api')

@misc_bp.route("/video_feed")
def video_feed():
    cctv_id = int(request.args.get("id", 1))

    def gen():
        # Placeholder statis
        placeholder_reconnecting = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(placeholder_reconnecting, "Reconnecting...", (50, 240),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (200, 200, 200), 3)

        placeholder_disconnected = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(placeholder_disconnected, "Camera Delay/Freeze", (30, 240),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 255), 3)

        last_warning_time = 0  # untuk debounce warning

        while True:
            now = time.time()

            # ------------------------------------------------------------
            # AMBIL FRAME + TIMESTAMP TERBARU (ini yang penting!)
            # ------------------------------------------------------------
            with state.ANNOTATED_FRAME_LOCK:
                data = state.annotated_frames.get(cctv_id)
                if data and isinstance(data, tuple) and len(data) == 2:
                    frame, frame_timestamp = data
                else:
                    # Belum ada frame sama sekali (pertama kali atau reconnect)
                    logging.warning(f"[CCTV {cctv_id}] annotated_frames missing (reconnecting). Using placeholder.")
                    state.annotated_frames[cctv_id] = (placeholder_reconnecting, now)
                    frame = placeholder_reconnecting
                    frame_timestamp = now

            # ------------------------------------------------------------
            # CEK FREEZE PAKAI TIMESTAMP YANG BENAR-BENAR TERBARU
            # ------------------------------------------------------------
            if now - frame_timestamp > 10: 
                if now - last_warning_time > 5:  # batasi spam warning
                    logging.warning(f"[CCTV {cctv_id}] FREEZE → {now - frame_timestamp:.1f}s → placeholder")
                    last_warning_time = now
                frame_to_send = placeholder_disconnected
            else:
                frame_to_send = frame   # frame deteksi atau placeholder reconnect

            # ------------------------------------------------------------
            # KIRIM FRAME
            # ------------------------------------------------------------
            ret, jpeg = cv2.imencode('.jpg', frame_to_send, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ret:
                time.sleep(0.05)
                continue

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')

            time.sleep(0.03)  # ~30 FPS streaming

    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

@misc_bp.route('/object_classes', methods=['GET'])
def get_object_classes():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT id, name, color_r, color_g, color_b, is_violation FROM object_class")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(rows)

@misc_bp.route('/refresh_config', methods=['POST'])
def refresh_config():
    config_service.refresh_active_violations()
    return jsonify({"success": True})

@misc_bp.route('/settings', methods=['GET', 'POST'])
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