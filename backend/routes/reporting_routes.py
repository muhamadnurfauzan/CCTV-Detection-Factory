import logging

from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

from db.db_config import get_connection
import config as config
import services.notification_service as notification_service

reports_bp = Blueprint('reports_bp', __name__, url_prefix='/api')

@reports_bp.route('/reports', methods=['GET'])
def get_reports():
    conn = None
    cur = None
    try:
        # Ambil parameter dari request
        search_query = request.args.get('search', '')
        sort_order = request.args.get('sort', 'desc').upper()  
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        
        # Validasi parameter
        if sort_order not in ('ASC', 'DESC'): sort_order = 'DESC'
        if page < 1: page = 1
        if limit not in (10, 25, 50): limit = 10
            
        offset = (page - 1) * limit
        
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # --- Base Query dengan JOIN ---
        base_query = """
            FROM violation_detection vd
            JOIN cctv_data cd ON vd.id_cctv = cd.id
            JOIN object_class oc ON vd.id_violation = oc.id
            WHERE 1=1
        """
        
        # --- List Parameter dan Kondisi ---
        where_conditions = []
        query_params = []

        # 1. Search Filter (berdasarkan Nama CCTV)
        if search_query:
            where_conditions.append("cd.name ILIKE %s")
            query_params.append(f"%{search_query}%")
        
        # Gabungkan semua kondisi WHERE
        where_clause = "AND " + " AND ".join(where_conditions) if where_conditions else ""
            
        # --- 2. Query Total Item (untuk Pagination) ---
        count_query = f"SELECT COUNT(*) AS total {base_query} {where_clause}"
        cur.execute(count_query, query_params)
        total_items = cur.fetchone()['total']
        
        # --- 3. Query Data Laporan ---
        # NOTE: vd.image sudah berisi URL penuh dari Supabase Storage
        data_query = f"""
            SELECT
                vd.id,
                cd.name AS cctv_name,
                oc.name AS violation_name,
                vd.image AS image_path,  
                vd.timestamp
            {base_query}
            {where_clause}
            ORDER BY
                vd.timestamp {sort_order}
            LIMIT %s OFFSET %s
        """
        
        data_params = query_params + [limit, offset]
        cur.execute(data_query, data_params)
        reports = cur.fetchall()

        # --- Format data akhir dan Generate Signed URL ---
        final_reports = []
        BUCKET_NAME = config.SUPABASE_BUCKET

        for report in reports:
            signed_url = report['image_path'] 
            
            # Cek jika URL adalah URL Supabase yang valid (bukan error atau null)
            if report['image_path'] and 'supabase.co' in report['image_path']:
                try:
                    # Ambil PATH RELATIF: Potong bagian host/bucket dari URL penuh
                    path_parts = report['image_path'].split(f'/public/{BUCKET_NAME}/')
                    if len(path_parts) > 1:
                        relative_path = path_parts[1]
                        
                        signed_data = config.supabase.storage.from_(BUCKET_NAME).create_signed_url(relative_path, 3600)
                        signed_url = signed_data['signedUrl']
                    else:
                        logging.warning(f"Could not parse relative path for signed URL: {report['image_path']}")

                except Exception as sign_err:
                    logging.error(f"[SUPABASE SIGN ERROR]: {sign_err}")
                    # Jika gagal sign, gunakan URL mentah (hanya akan berfungsi jika bucket public)
                    signed_url = report['image_path']
            
            final_reports.append({
                'id': report['id'],
                'cctv_name': report['cctv_name'],
                'violation_name': report['violation_name'],
                'timestamp': report['timestamp'].isoformat() if report['timestamp'] else None,
                'image_url': signed_url,
            })
            
        return jsonify({
            "reports": final_reports,
            "totalItems": total_items,
            "currentPage": page,
            "itemsPerPage": limit
        }), 200

    except Exception as e:
        logging.error(f"[REPORTS API ERROR]: {e}")
        return jsonify({"error": "Failed to retrieve reports data."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@reports_bp.route('/send_email/<int:violation_id>', methods=['POST'])
def send_email(violation_id):
    """
    API untuk mengirim email notifikasi secara MANUAL.
    Menerima ID Pelanggaran sebagai parameter.
    """
    logging.info(f"[EMAIL MANUAL] Menerima permintaan kirim email untuk Violation ID: {violation_id}")
    
    if notification_service.notify_user_by_violation_id(violation_id):
        return jsonify({"success": True, "message": "Email notifikasi berhasil dikirim."}), 200
    else:
        return jsonify({"success": False, "message": "Gagal mengirim email notifikasi. Cek log server untuk detail."}), 500