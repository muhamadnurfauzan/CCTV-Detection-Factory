# routes/cctv_crud.py
import io
import sys
import cv2
import json
import logging

from flask import Blueprint, request, jsonify, send_file, redirect
from psycopg2.extras import RealDictCursor, execute_batch

from db.db_config import get_connection
from core.cctv_scheduler import refresh_scheduler_state
from utils.auth import require_role
import core.detection as detection
import config as config
import services.cctv_services as cctv_service
import services.config_service as config_service

cctv_bp = Blueprint('cctv', __name__, url_prefix='/api')
    
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

# --- Helper: Menghapus dan menyimpan jadwal CCTV ---
def save_cctv_schedules(conn, cur, cctv_id, schedules):
    """Menghapus jadwal lama dan menyimpan jadwal baru untuk CCTV ID tertentu."""
    # 1. Hapus semua jadwal lama
    cur.execute("DELETE FROM cctv_schedule WHERE cctv_id = %s", (cctv_id,))

    if not schedules:
        return

    # 2. Siapkan data untuk insert massal
    insert_data = []
    for schedule in schedules:
        days_array = schedule.get('days', [])
        start_time = schedule.get('start_time')
        end_time = schedule.get('end_time')
        active = schedule.get('active', True)

        # Pastikan data lengkap
        if start_time and end_time and days_array:
            insert_data.append((
                cctv_id,
                start_time,
                end_time,
                days_array, # PostgreSQL akan menerima list/array Python untuk kolom text[]
                active
            ))

    # 3. Insert massal jadwal baru
    if insert_data:
        schedule_query = """
            INSERT INTO cctv_schedule (cctv_id, start_time, end_time, days, active)
            VALUES (%s, %s, %s, %s, %s)
        """
        execute_batch(cur, schedule_query, insert_data)

@cctv_bp.route("/cctv-add", methods=["POST"])
@require_role(['super_admin'])
def add_new_cctv():
    data = request.json
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
    roi_json = None
    if data.get('area'):
        try:
            roi_json = json.loads(data['area'])
            if not isinstance(roi_json, dict) or 'items' not in roi_json:
                return jsonify({"error": "Invalid ROI format"}), 400
        except json.JSONDecodeError:
            return jsonify({"error": "Invalid JSON in area"}), 400
        
    schedules = data.get("schedules", [])

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Simpan langsung ke database dalam bentuk JSON string (Psycopg2 akan menangani JSONB)
        cur.execute("""
            INSERT INTO cctv_data (name, ip_address, port, token, location, area, enabled)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            data['name'], data['ip_address'], data['port'], data['token'],
            data.get('location'), 
            json.dumps(roi_json) if roi_json else None,
            data.get('enabled', False)
        ))
        cctv_id = cur.fetchone()['id']
        conn.commit()

        # --- LANGKAH PENTING: REFRESH CONFIG ---
        cctv_service.refresh_all_cctv_configs()

        if data.get('enabled', False):
            # Jika enabled=True, mulai thread deteksi
            detection.start_detection_for_cctv(cctv_id)
            logging.info(f"[THREAD] Started detection for CCTV {cctv_id} due to adding as enabled.")

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

@cctv_bp.route('/rtsp-snapshot', methods=['POST'])
@require_role(['super_admin'])
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
        cap = detection.open_stream(temp_cctv) 
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

@cctv_bp.route('/cctv-update/<int:cctv_id>', methods=['PUT'])
@require_role(['super_admin'])
def update_cctv(cctv_id):
    data = request.get_json()
    logging.info(f"[UPDATE CCTV {cctv_id}] Received: {data}")

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1. FIX: Ambil data CCTV lama sebelum update (untuk cek perubahan enabled status)
        cur.execute("SELECT id, name, ip_address, port, token, location, area, enabled FROM cctv_data WHERE id = %s", (cctv_id,))
        old_cctv = cur.fetchone()
        if not old_cctv:
            return jsonify({"error": "CCTV not found"}), 404
            
        old_enabled_status = old_cctv['enabled']
        old_area_filename = old_cctv['area']

        # Update fields yang ada
        update_fields = []
        update_values = []
        
        # Tentukan apakah ada perubahan yang memerlukan restart thread
        needs_restart = False

        if 'name' in data:
            update_fields.append("name = %s")
            update_values.append(data['name'])
        if 'ip_address' in data:
            if not is_valid_ip(data['ip_address']):
                return jsonify({"error": "Invalid IP Address value (must be 0.0.0.0 to 255.255.255.255)"}), 400
            update_fields.append("ip_address = %s")
            update_values.append(data['ip_address'])
            if data['ip_address'] != old_cctv['ip_address']: needs_restart = True
            
        if 'port' in data:
            update_fields.append("port = %s")
            update_values.append(data['port'])
            if data['port'] != old_cctv['port']: needs_restart = True
            
        token = data.get('token')
        if token and '?' in token:
            token = token.split('?')[0]
            data['token'] = token
            
        if 'token' in data:
            update_fields.append("token = %s")
            update_values.append(data['token'])
            if data['token'] != old_cctv['token']: needs_restart = True

        if 'location' in data:
            update_fields.append("location = %s")
            update_values.append(data['location'])
            
        # Status enabled
        new_enabled_status = data.get('enabled', old_enabled_status)
        if 'enabled' in data:
            update_fields.append("enabled = %s")
            update_values.append(new_enabled_status)
        
        if 'area' in data:
            try:
                roi_json = json.loads(data['area']) if isinstance(data['area'], str) else data['area']
                update_fields.append("area = %s")
                update_values.append(json.dumps(roi_json))
                needs_restart = True 
            except Exception as e:
                return jsonify({"error": f"Invalid ROI JSON: {str(e)}"}), 400

        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400

        update_query = f"UPDATE cctv_data SET {', '.join(update_fields)} WHERE id = %s RETURNING *"
        update_values.append(cctv_id)
        cur.execute(update_query, update_values)
        updated_cctv = cur.fetchone()
        conn.commit()

        # 2. FIX UTAMA: Refresh config untuk memuat data lengkap (termasuk ROI)
        cctv_service.refresh_all_cctv_configs() 

        # 3. FIX: Start/Stop Detection berdasarkan perubahan status
        if updated_cctv:
            
            # Jika status berubah dari non-aktif ke aktif: START
            if new_enabled_status and not old_enabled_status:
                detection.start_detection_for_cctv(cctv_id)
                logging.info(f"[THREAD] Started detection for CCTV {cctv_id} due to enabling.")
                
            # Jika status berubah dari aktif ke non-aktif: STOP
            elif not new_enabled_status and old_enabled_status:
                detection.stop_detection_for_cctv(cctv_id)
                logging.info(f"[THREAD] Stopped detection for CCTV {cctv_id} due to disabling.")
                
            # Jika status tetap aktif, tapi ada perubahan konfigurasi koneksi/model
            elif new_enabled_status and old_enabled_status and needs_restart:
                logging.info(f"[THREAD] Restarting detection for CCTV {cctv_id} due to config change.")
                detection.stop_detection_for_cctv(cctv_id)
                detection.start_detection_for_cctv(cctv_id)

        return jsonify(updated_cctv), 200
    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[UPDATE ERROR {cctv_id}]: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@cctv_bp.route('/cctv-delete/<int:cctv_id>', methods=['DELETE'])
@require_role(['super_admin'])
def delete_cctv(cctv_id):
    conn = None
    cur = None
    try:
        # 1. Hentikan thread deteksi (jika berjalan)
        detection.stop_detection_for_cctv(cctv_id) 

        conn = get_connection()
        cur = conn.cursor()

        # --- LANGKAH PENTING: CASCADE DELETION MANUAL ---
        logging.info(f"[DELETE] Deleting cascade data for CCTV {cctv_id}")

        # Hapus log harian (violation_daily_log)
        cur.execute("DELETE FROM violation_daily_log WHERE id_cctv = %s", (cctv_id,))

        # Hapus data pelanggaran (violation_detection)
        cur.execute("DELETE FROM violation_detection WHERE id_cctv = %s", (cctv_id,))
        
        # Hapus mapping user (jika user_cctv_map sudah diterapkan)
        # cur.execute("DELETE FROM user_cctv_map WHERE cctv_id = %s", (cctv_id,)) 

        # 3. Hapus dari DB (Tabel Induk)
        cur.execute("DELETE FROM cctv_data WHERE id = %s", (cctv_id,))
        conn.commit()

        # 4. FIX UTAMA: Refresh config setelah penghapusan
        cctv_service.refresh_all_cctv_configs() 
        
        return jsonify({"success": True}), 200
    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[DELETE ERROR {cctv_id}]: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@cctv_bp.route("/cctv-all", methods=["GET"])
@require_role(['super_admin', 'report_viewer', 'viewer'])
def get_all_cctv():
    conn = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    # cursor.execute("SELECT id, name, ip_address, location, enabled FROM cctv_data;")
    cursor.execute("SELECT * FROM cctv_data ORDER BY id ASC;")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)

@cctv_bp.route('/cctv-schedules/<int:cctv_id>', methods=['GET', 'POST'])
@require_role(['super_admin'])
def cctv_schedules(cctv_id):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if request.method == 'GET':
        try:
            cur.execute("""
                SELECT id, day_of_week, start_time, end_time, is_active
                FROM cctv_scheduler 
                WHERE cctv_id = %s 
                ORDER BY day_of_week, start_time
            """, (cctv_id,))
            rows = cur.fetchall()

            if not rows:
                return jsonify([])

            # Format time jadi HH:MM tanpa detik
            serialized_rows = []
            for row in rows:
                r = dict(row)
                if r['start_time']:
                    r['start_time'] = r['start_time'].strftime('%H:%M')  
                if r['end_time']:
                    r['end_time'] = r['end_time'].strftime('%H:%M')
                serialized_rows.append(r)

            return jsonify(serialized_rows)

        except Exception as e:
            logging.error(f"[SCHEDULER GET ERROR] CCTV {cctv_id}: {e}")
            return jsonify({"error": "Failed to load schedule"}), 500
        finally:
            cur.close()
            conn.close()

    if request.method == 'POST':
        schedules = request.json.get('schedules', [])
        try:
            # Hapus semua jadwal lama
            cur.execute("DELETE FROM cctv_scheduler WHERE cctv_id = %s", (cctv_id,))

            # Insert baru
            if schedules:
                insert_query = """
                    INSERT INTO cctv_scheduler (cctv_id, day_of_week, start_time, end_time, is_active)
                    VALUES (%s, %s, %s, %s, %s)
                """
                data = []
                for s in schedules:
                    # Handle midnight crossover: split jadi 2 row jika end_time < start_time
                    start = s['start_time']
                    end = s['end_time']
                    days = s['days']  # array [1,2,3,4,5]
                    active = s.get('is_active', True)

                    if end <= start and end != '00:00:00':  # crossover
                        # Part 1: start → 00:00
                        for day in days:
                            data.append((cctv_id, day, start, '00:00:00', active))
                        # Part 2: 00:00 → end (di hari berikutnya)
                        next_days = [(d + 1) % 7 for d in days]
                        for day in next_days:
                            data.append((cctv_id, day, '00:00:00', end, active))
                    else:
                        for day in days:
                            data.append((cctv_id, day, start, end, active))

                if data:
                    execute_batch(cur, insert_query, data)

            conn.commit()
            # Refresh scheduler state setelah ubah jadwal
            refresh_scheduler_state()
            return jsonify({"success": True})
        except Exception as e:
            conn.rollback()
            logging.error(f"[SCHEDULER SAVE ERROR] {e}")
            return jsonify({"error": str(e)}), 500
        finally:
            cur.close()
            conn.close()

@cctv_bp.route('/refresh-scheduler', methods=['POST'])
@require_role(['super_admin'])
def refresh_scheduler_now():
    refresh_scheduler_state()
    return jsonify({"success": True, "message": "Scheduler refreshed"})