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
                    is_active = true  -- tambahkan ini!
            """, (data['subject_template'], data['body_template']))
            conn.commit()
            return jsonify({"success": True})
    finally:
        cur.close()
        conn.close()

@email_bp.route('/email-template/weekly-recap', methods=['GET', 'POST'])
@require_role(['super_admin'])
def email_template_weekly_recap():
    return handle_email_template_recap('violation_weekly_recap')

@email_bp.route('/email-template/monthly-recap', methods=['GET', 'POST'])
@require_role(['super_admin'])
def email_template_monthly_recap():
    return handle_email_template_recap('violation_monthly_recap')

@email_bp.route('/email-template/violation-custom-report', methods=['GET', 'POST'])
@require_role(['super_admin'])
def email_template_custom_report():
    return handle_email_template_recap('violation_custom_report')

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
def send_recap_email_manual():
    data = request.json
    # report_type sekarang bisa berupa template key penuh
    template_key = data.get('report_type') 
    start_date_str = data.get('start_date') 
    end_date_str = data.get('end_date') 
    
    if not all([template_key, start_date_str, end_date_str]):
        return jsonify({"error": "Missing start_date, end_date, or template key."}), 400

    try:
        from datetime import datetime, timedelta 
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d') + timedelta(days=1)
        
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400
        
    allowed_keys = ['violation_weekly_recap', 'violation_monthly_recap', 'violation_custom_report']
    if template_key not in allowed_keys:
        return jsonify({"error": "Invalid template key provided."}), 400

    logging.info(f"[API] Memicu pengiriman rekap manual: {template_key} dari {start_date_str} s/d {end_date_str}")

    report_type_display = template_key.replace('violation_', '').replace('_recap', '').replace('_report', '').title()
    
    success = notification_service.send_violation_recap_emails(start_date, end_date, report_type_display, template_key)
    
    if success:
        return jsonify({"success": True, "message": f"Manual recap email using template '{template_key}' successfully triggered."})
    else:
        return jsonify({"success": False, "message": "Failed to trigger recap email. Check backend logs for details."}), 500