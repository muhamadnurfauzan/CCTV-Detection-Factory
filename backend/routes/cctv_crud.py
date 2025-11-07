# routes/cctv_crud.py
import os
import io
import cv2
import json
from flask import Blueprint, request, jsonify, send_file
from psycopg2.extras import RealDictCursor
import logging
import backend.config as config
from db.db_config import get_connection
from backend import cctv_detection
from backend import config

cctv_bp = Blueprint('cctv', __name__, url_prefix='/api')

# --- PATH LOKAL ---
ROI_DIR = os.path.join(os.path.dirname(__file__), '..', 'JSON')
os.makedirs(ROI_DIR, exist_ok=True)  # Buat folder jika belum ada

# --- Helper: Simpan JSON ke file ---
def save_roi_to_file(roi_data, cctv_id):
    filename = f"cctv_{cctv_id}.json"
    filepath = os.path.join(ROI_DIR, filename)
    try:
        with open(filepath, 'w') as f:
            json.dump(roi_data, f, indent=2)
        logging.info(f"[ROI] Saved to {filepath}")
        return filename  # Hanya return nama file
    except Exception as e:
        logging.error(f"[ROI SAVE ERROR]: {e}")
        return None

@cctv_bp.route('/cctv_add', methods=['POST'])
def add_cctv():
    data = request.get_json()
    logging.info(f"[ADD CCTV] Received: {data}")

    required = ['name', 'ip_address', 'port', 'token']
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    # --- Validasi sederhana ---
    if not data['ip_address'] or not data['port'] or not data['token']:
        return jsonify({"error": "IP, Port, and Token cannot be empty"}), 400

    # --- Simpan ROI ke file ---
    area_path = None
    if data.get('area'):
        try:
            roi_json = json.loads(data['area'])
            if not isinstance(roi_json, dict) or 'items' not in roi_json:
                return jsonify({"error": "Invalid ROI format"}), 400
        except json.JSONDecodeError:
            return jsonify({"error": "Invalid JSON in area"}), 400

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("""
            INSERT INTO cctv_data (name, ip_address, port, token, location, area, enabled)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            data['name'], data['ip_address'], data['port'], data['token'],
            data.get('location'), None, data.get('enabled', True)
        ))
        cctv_id = cur.fetchone()['id']

        # Simpan ROI
        if data.get('area'):
            filename = save_roi_to_file(roi_json, cctv_id)
            if filename:
                cur.execute("UPDATE cctv_data SET area = %s WHERE id = %s", (filename, cctv_id))
                area_path = filename
            else:
                raise Exception("Failed to save ROI file")

        conn.commit()

        # --- BANGUN URL RTSPS ---
        rtsps_url = f"rtsps://{data['ip_address']}:{data['port']}/{data['token']}?enableSrtp"

        # Simpan ke config tanpa memulai deteksi
        config.cctv_streams[cctv_id] = {
            'url': rtsps_url,
            'enabled': data.get('enabled', True),
            'name': data['name']
        }

        config.refresh_active_violations()

        return jsonify({
            "id": cctv_id,
            "name": data['name'],
            "ip_address": data['ip_address'],
            "location": data.get('location'),
            "enabled": data.get('enabled', True),
            "area": area_path
        }), 201

    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[ADD ERROR]: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@cctv_bp.route('/rtsp_snapshot', methods=['POST'])
def rtsp_snapshot():
    data = request.get_json()
    url = data.get('url')
    if not url or not url.startswith(('rtsp://', 'rtsps://')):
        return jsonify({"error": "Valid URL required"}), 400

    try:
        # Gunakan open_stream dari cctv_detection untuk handle RTSPS/fallback
        temp_cctv = {'name': 'preview', 'url': url}
        cap = cctv_detection.open_stream(temp_cctv)
        if not cap:
            return jsonify({"error": "Cannot open stream"}), 500

        ret, frame = cap.read()
        cap.release()
        if not ret:
            return jsonify({"error": "No frame captured"}), 500

        _, buffer = cv2.imencode('.jpg', frame)
        return send_file(io.BytesIO(buffer), mimetype='image/jpeg')
    except Exception as e:
        logging.error(f"[SNAPSHOT ERROR]: {e}")
        return jsonify({"error": str(e)}), 500