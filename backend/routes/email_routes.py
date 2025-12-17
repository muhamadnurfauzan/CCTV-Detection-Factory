# backend/routes/email_routes.py
import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

from db.db_config import get_connection
from utils.auth import require_role
import services.notification_service as notification_service

email_bp = Blueprint('email', __name__, url_prefix='/api')

def handle_email_template_recap(template_key):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if request.method == 'GET':
            cur.execute("SELECT subject_template, body_template FROM email_templates WHERE template_key = %s", (template_key,))
            data = cur.fetchone()
            return jsonify(data or {"subject_template": "", "body_template": ""})

        else:  # POST
            data = request.json
            cur.execute("""
                INSERT INTO email_templates (template_key, subject_template, body_template, is_active)
                VALUES (%s, %s, %s, true)
                ON CONFLICT (template_key) DO UPDATE SET
                    subject_template = EXCLUDED.subject_template,
                    body_template = EXCLUDED.body_template,
                    is_active = true
            """, (template_key, data['subject_template'], data['body_template']))
            conn.commit()
            return jsonify({"success": True})
    finally:
        cur.close()
        conn.close()

@email_bp.route('/email-template/ppe-violation', methods=['GET', 'POST'])
@require_role(['super_admin'])
def email_template_ppe():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if request.method == 'GET':
            cur.execute("SELECT subject_template, body_template FROM email_templates WHERE template_key = 'ppe_violation'")
            data = cur.fetchone()
            return jsonify(data or {"subject_template": "", "body_template": ""})

        else:  # POST
            data = request.json
            cur.execute("""
                INSERT INTO email_templates (template_key, subject_template, body_template, is_active)
                VALUES ('ppe_violation', %s, %s, true)
                ON CONFLICT (template_key) DO UPDATE SET
                    subject_template = EXCLUDED.subject_template,
                    body_template = EXCLUDED.body_template,
                    is_active = true 
            """, (data['subject_template'], data['body_template']))
            conn.commit()
            return jsonify({"success": True})
    finally:
        cur.close()
        conn.close()

@email_bp.route('/email-template/violation-weekly-recap', methods=['GET', 'POST'])
@require_role(['super_admin'])
def email_template_weekly_recap():
    return handle_email_template_recap('violation_weekly_recap')

@email_bp.route('/email-template/violation-monthly-recap', methods=['GET', 'POST'])
@require_role(['super_admin'])
def email_template_monthly_recap():
    return handle_email_template_recap('violation_monthly_recap')

@email_bp.route('/email-template/violation-custom-report', methods=['GET', 'POST'])
@require_role(['super_admin'])
def email_template_custom_report():
    return handle_email_template_recap('violation_custom_report')

@email_bp.route('/email-templates/list', methods=['GET'])
@require_role(['super_admin'])
def get_template_keys():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Mengambil semua key yang aktif
        cur.execute("SELECT template_key FROM email_templates WHERE is_active = true OR is_active IS NULL ORDER BY template_key ASC")
        keys = cur.fetchall()
        # Mengembalikan hanya list string
        return jsonify([row['template_key'] for row in keys])
    finally:
        cur.close()
        conn.close()

@email_bp.route('/send-email/<int:violation_id>', methods=['POST'])
@require_role(['super_admin', 'report_viewer'])
def send_email(violation_id):
    """
    API untuk mengirim email notifikasi secara MANUAL.
    Menerima ID Pelanggaran sebagai parameter.
    """
    logging.info(f"[EMAIL MANUAL] Menerima permintaan kirim email untuk Violation ID: {violation_id}")
    
    if notification_service.notify_user_by_violation_id(violation_id):
        return jsonify({"success": True, "message": "Notification email sent successfully."}), 200
    else:
        return jsonify({"success": False, "message": "Failed to send notification email. Check server log for details."}), 500

@email_bp.route('/send-recap', methods=['POST'])
@require_role(['super_admin', 'report_viewer']) 
def send_recap_manual():
    data = request.json
    try:
        start_dt = datetime.strptime(data['start_date'], '%Y-%m-%d')
        end_dt = datetime.strptime(data['end_date'], '%Y-%m-%d')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # AMBIL DATA FILTER DARI REQUEST JSON
        selected_user_ids = data.get('selected_user_ids')
        selected_cctv_ids = data.get('selected_cctv_ids')

        # Frontend mengirim 'template_key' (misal: 'violation_weekly_recap')
        template_id = data.get('template_key')

        # TERUSKAN KE SERVICE
        success = notification_service.send_violation_recap_emails(
            start_date=start_dt,
            end_date=end_dt,
            template_key=template_id,     
            selected_user_ids=selected_user_ids,
            selected_cctv_ids=selected_cctv_ids 
        )
        
        logging.info(f"[EMAIL MANUAL] Recap email process completed with status: {success}")

        if success:
            return jsonify({"message": "Recap emails sent successfully."})
        else:
            return jsonify({"message": "No violations found or email failed to send."}), 404
            
    except Exception as e:
        logging.error(f"Error in manual recap: {e}")
        return jsonify({"message": str(e)}), 500
    
@email_bp.route('/users-list', methods=['GET'])
@require_role(['super_admin', 'report_viewer'])
def get_users_list():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, full_name, email FROM users WHERE role not in ('super_admin') ORDER BY full_name;")
        users = cur.fetchall()
        return jsonify(users)
    except Exception as e:
        logging.error(f"[USERS LIST API ERROR]: {e}")
        return jsonify({"error": "Failed to retrieve user list."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@email_bp.route('/cctvs-list', methods=['GET'])
@require_role(['super_admin', 'report_viewer'])
def get_cctvs_list():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, name, location FROM cctv_data ORDER BY name;")
        cctvs = cur.fetchall()
        return jsonify(cctvs)
    except Exception as e:
        logging.error(f"[CCTVS LIST API ERROR]: {e}")
        return jsonify({"error": "Failed to retrieve CCTV list."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@email_bp.route('/user-cctv-map-all', methods=['GET'])
@require_role(['super_admin', 'report_viewer'])
def get_user_cctv_map_all():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Ambil semua mapping, user, dan detail CCTV
        cur.execute("""
            SELECT 
                u.id AS user_id,
                ucm.cctv_id,
                cd.name AS cctv_name,
                cd.location
            FROM users u
            JOIN user_cctv_map ucm ON u.id = ucm.user_id
            JOIN cctv_data cd ON ucm.cctv_id = cd.id
            ORDER BY u.id, cd.name;
        """)
        data = cur.fetchall()
        
        # Mengelompokkan data berdasarkan user_id (untuk memudahkan frontend)
        # { user_id: [cctv_id, cctv_id, ...], ... }
        user_map = {}
        for row in data:
            if row['user_id'] not in user_map:
                user_map[row['user_id']] = []
            user_map[row['user_id']].append({
                'id': row['cctv_id'],
                'name': row['cctv_name'],
                'location': row['location']
            })

        return jsonify(user_map)
    except Exception as e:
        logging.error(f"[USER CCTV MAP API ERROR]: {e}")
        return jsonify({"error": "Failed to retrieve user CCTV map."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()