# routes/cctv_crud.py
import os
import io
import cv2
import json
from flask import Blueprint, request, jsonify, send_file, redirect
from psycopg2.extras import RealDictCursor
import logging
import backend.config as config
from db.db_config import get_connection
from backend import cctv_detection
from backend import config

cctv_bp = Blueprint('cctv', __name__, url_prefix='/api')

# --- Helper: Simpan JSON ke Supabase Bucket ---
def save_roi_to_file(roi_data, cctv_id):
    """Mengunggah data ROI JSON ke Supabase Storage."""
    filename = f"cctv_{cctv_id}.json"
    storage_path = f"{config.SUPABASE_ROI_DIR}/{filename}"
    
    try:
        if roi_data is None: # Case: Clear ROI (Hapus file dari Supabase)
            config.supabase.storage.from_(config.SUPABASE_BUCKET).remove([storage_path])
            logging.info(f"[ROI] Removed file from Supabase: {storage_path}")
            return None # Return None untuk update DB area=NULL

        # Konversi JSON ke string Bytes untuk diunggah
        json_string = json.dumps(roi_data, indent=2)
        json_bytes = json_string.encode('utf-8')
        
        # Upload file dengan opsi upsert=True (menimpa jika sudah ada)
        res = config.supabase.storage.from_(config.SUPABASE_BUCKET).upload(
            file=json_bytes,
            path=storage_path,
            file_options={"content-type": "application/json", "upsert": "true"}
        )
        
        logging.info(f"[ROI] Saved to Supabase: {storage_path}")
        return filename  # Hanya return nama file
    except Exception as e:
        logging.error(f"[ROI SAVE ERROR TO SUPABASE]: {e}")
        return None
    
# --- Helper: Validasi IP Address ---
def is_valid_ip(ip_address):
    """Memeriksa apakah IP address memiliki 4 segmen, dan setiap segmen 0-255."""
    try:
        segments = ip_address.split('.')
        if len(segments) != 4:
            return False
        for segment in segments:
            if not segment.isdigit():
                return False
            num = int(segment)
            if num < 0 or num > 255:
                return False
        return True
    except:
        return False

@cctv_bp.route('/roi/<filename>', methods=['GET'])
def get_roi_file(filename):
    """Mengambil dan mengirim file JSON ROI dari Supabase."""
    storage_path = f"{config.SUPABASE_ROI_DIR}/{filename}"
    
    if not filename.endswith('.json'):
        return jsonify({"error": "Invalid file type requested"}), 400
        
    try:
        public_url = config.supabase.storage.from_(config.SUPABASE_BUCKET).get_public_url(storage_path)
        
        if not public_url:
             return jsonify({"error": "ROI file not found or URL not generated"}), 404
             
        return redirect(public_url)
        
    except Exception as e:
        logging.error(f"[ROI GET ERROR FROM SUPABASE]: {e}")
        return jsonify({"error": "Failed to retrieve ROI file from storage"}), 500

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
    
    # --- Validasi IP Address Ketat ---
    if not is_valid_ip(data['ip_address']):
        return jsonify({"error": "Invalid IP Address value (must be 0.0.0.0 to 255.255.255.255)"}), 400

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

        # 1. INSERT DATA KE DB (dengan area=NULL sementara)
        cur.execute("""
            INSERT INTO cctv_data (name, ip_address, port, token, location, area, enabled)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            data['name'], data['ip_address'], data['port'], data['token'],
            data.get('location'), None, data.get('enabled', False)
        ))
        cctv_id = cur.fetchone()['id']

        # 2. SIMPAN ROI KE SUPABASE (jika ada)
        if roi_json is not None:
            filename = save_roi_to_file(roi_json, cctv_id) # <-- Upload ke Supabase
            if filename:
                # 3. UPDATE DB dengan nama file dari Supabase
                cur.execute("UPDATE cctv_data SET area = %s WHERE id = %s", (filename, cctv_id))
                area_path = filename
            else:
                raise Exception("Failed to save ROI file to Supabase")

        conn.commit()

        # --- BANGUN URL RTSPS ---
        rtsps_url = f"rtsps://{data['ip_address']}:{data['port']}/{data['token']}?enableSrtp"

        # Simpan ke config tanpa memulai deteksi
        config.cctv_streams[cctv_id] = {
            'url': rtsps_url,
            'enabled': data.get('enabled', False),
            'name': data['name']
        }

        if data.get('enabled', False):
            # Jika enabled=True, mulai thread deteksi
            cctv_detection.start_detection_for_cctv(cctv_id)

        config.refresh_active_violations()

        return jsonify({
            "id": cctv_id,
            "name": data['name'],
            "ip_address": data['ip_address'],
            "port": data['port'],    
            "token": data['token'],
            "location": data.get('location'),
            "enabled": data.get('enabled', False),
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
    # SINTAKS PERUBAHAN: Menerima komponen
    ip = data.get('ip_address') 
    port = data.get('port')     
    token = data.get('token')   

    # Validasi komponen
    if not ip or not port or not token:
        # Kembalikan pesan error yang lebih jelas
        return jsonify({"error": "IP, Port, or Token components are missing or invalid"}), 400

    try:
        # Gunakan komponen yang diterima untuk membuat config sementara
        temp_cctv = {
            'name': 'preview', 
            'ip_address': ip,
            'port': port,
            'token': token
        }
        
        # open_stream akan berhasil karena strukturnya kini benar
        cap = cctv_detection.open_stream(temp_cctv) 
        if not cap:
            return jsonify({"error": "Cannot open stream. Check URL or network connection."}), 500

        ret, frame = cap.read()
        cap.release()
        if not ret:
            return jsonify({"error": "No frame captured. Stream likely disconnected immediately."}), 500

        _, buffer = cv2.imencode('.jpg', frame)
        return send_file(io.BytesIO(buffer), mimetype='image/jpeg')
    except Exception as e:
        logging.error(f"[SNAPSHOT ERROR]: {e}")
        return jsonify({"error": "Failed to connect to stream due to server error."}), 500

@cctv_bp.route('/cctv_update/<int:cctv_id>', methods=['PUT'])
def update_cctv(cctv_id):
    data = request.get_json()
    logging.info(f"[UPDATE CCTV {cctv_id}] Received: {data}")

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Update fields yang ada
        update_fields = []
        update_values = []
        if 'name' in data:
            update_fields.append("name = %s")
            update_values.append(data['name'])
        if 'ip_address' in data:
            if not is_valid_ip(data['ip_address']):
                return jsonify({"error": "Invalid IP Address value (must be 0.0.0.0 to 255.255.255.255)"}), 400
            update_fields.append("ip_address = %s")
            update_values.append(data['ip_address'])
        if 'port' in data:
            update_fields.append("port = %s")
            update_values.append(data['port'])
        
        token = data.get('token')
        if token and '?' in token:
            token = token.split('?')[0]
            data['token'] = token
        if 'token' in data:
            update_fields.append("token = %s")
            update_values.append(data['token'])

        if 'location' in data:
            update_fields.append("location = %s")
            update_values.append(data['location'])
        if 'enabled' in data:
            update_fields.append("enabled = %s")
            update_values.append(data['enabled'])

        area_path = None
        if 'area' in data:
            if data['area'] is None:
                roi_json = None
                raw_area_string = None 
            else:
                try:
                    raw_area_string = data['area'].strip() 
                    
                    if not raw_area_string.startswith('{'):
                         logging.warning(f"[ROI PARSE WARNING]: Ignoring invalid area string (looks like filename): {raw_area_string}")
                         raw_area_string = None 
                         roi_json = None

                    if raw_area_string: 
                        roi_json = json.loads(raw_area_string) 
                        
                        if not isinstance(roi_json, dict) or 'items' not in roi_json:
                            raise ValueError("Invalid ROI format: Missing 'items' key or not a dictionary.")
                
                except (json.JSONDecodeError, ValueError) as e:
                    logging.error(f"[ROI PARSE ERROR]: {e}")
                    if raw_area_string:
                        return jsonify({"error": f"Invalid ROI JSON format: {str(e)}"}), 400

            if roi_json is not None or (data['area'] is None and 'area' in data):
                filename = save_roi_to_file(roi_json, cctv_id)
                
                update_fields.append("area = %s")
                update_values.append(filename)
                area_path = filename


        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400

        update_query = f"UPDATE cctv_data SET {', '.join(update_fields)} WHERE id = %s RETURNING *"
        update_values.append(cctv_id)
        cur.execute(update_query, update_values)
        updated_cctv = cur.fetchone()
        conn.commit()

        # Update config jika perlu
        if updated_cctv:
            rtsps_url = f"rtsps://{updated_cctv['ip_address']}:{updated_cctv['port']}/{updated_cctv['token']}?enableSrtp"
            config.cctv_streams[cctv_id] = {
                'url': rtsps_url,
                'enabled': updated_cctv['enabled'],
                'name': updated_cctv['name']
            }
            config.refresh_active_violations()

        return jsonify(updated_cctv), 200
    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[UPDATE ERROR {cctv_id}]: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@cctv_bp.route('/cctv_delete/<int:cctv_id>', methods=['DELETE'])
def delete_cctv(cctv_id):
    conn = None
    cur = None
    try:
        # 1. Hentikan thread deteksi (jika berjalan)
        cctv_detection.stop_detection_for_cctv(cctv_id) 

        conn = get_connection()
        cur = conn.cursor()

        # --- LANGKAH PENTING: CASCADE DELETION MANUAL ---
        logging.info(f"[DELETE] Deleting cascade data for CCTV {cctv_id}")

        # Hapus konfigurasi violation (cctv_violation_config)
        cur.execute("DELETE FROM cctv_violation_config WHERE cctv_id = %s", (cctv_id,))

        # Hapus log harian (violation_daily_log)
        cur.execute("DELETE FROM violation_daily_log WHERE id_cctv = %s", (cctv_id,))

        # Hapus data pelanggaran (violation_detection)
        cur.execute("DELETE FROM violation_detection WHERE id_cctv = %s", (cctv_id,))
        
        # Hapus mapping user (jika user_cctv_map sudah diterapkan)
        # cur.execute("DELETE FROM user_cctv_map WHERE cctv_id = %s", (cctv_id,)) 
        
        # 2. Hapus ROI file dari SUPABASE (Ambil nama file dari DB sebelum dihapus)
        cur.execute("SELECT area FROM cctv_data WHERE id = %s", (cctv_id,))
        area = cur.fetchone()
        if area and area[0]:
            storage_path = f"{config.SUPABASE_ROI_DIR}/{area[0]}"
            # Panggil Supabase client untuk menghapus file
            config.supabase.storage.from_(config.SUPABASE_BUCKET).remove([storage_path])
            logging.info(f"[DELETE] Removed ROI file from Supabase: {storage_path}")

        # 3. Hapus dari DB (Tabel Induk)
        cur.execute("DELETE FROM cctv_data WHERE id = %s", (cctv_id,))
        conn.commit()

        # 4. Hapus dari config cache
        config.cctv_streams.pop(cctv_id, None)
        config.refresh_active_violations()

        return jsonify({"success": True}), 200
    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[DELETE ERROR {cctv_id}]: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()
