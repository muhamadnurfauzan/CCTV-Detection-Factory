import logging

from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

from db.db_config import get_connection
import config as config
from backend.services.cloud_storage import delete_violation_image
from utils.auth import require_role

reports_bp = Blueprint('reports_bp', __name__, url_prefix='/api')

@reports_bp.route('/reports', methods=['GET'])
@require_role(['super_admin', 'report_viewer'])
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
        # NOTE: 
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
        for report in reports:
            # Langsung arahkan ke path assets lokal
            raw_path = report['image_path'].replace('cctv/', '') if report['image_path'] else ""
            local_url = f"/assets/violations/{raw_path}"
            
            final_reports.append({
                'id': report['id'],
                'cctv_name': report['cctv_name'],
                'violation_name': report['violation_name'],
                'timestamp': report['timestamp'].isoformat() if report['timestamp'] else None,
                'image_url': local_url, # Menggunakan URL lokal
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

@reports_bp.route('/reports-delete/<int:violation_id>', methods=['DELETE'])
@require_role(['super_admin'])
def delete_report(violation_id): 
    conn = None
    cur = None
    image_url = None
    
    try:
        conn = get_connection()
        cur = conn.cursor()

        # 1. AMBIL IMAGE URL
        cur.execute("SELECT image FROM violation_detection WHERE id = %s", (violation_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": f"Report with ID {violation_id} not found."}), 404
        
        image_url = row[0]
        
        # 2. HAPUS DATA DARI DATABASE
        cur.execute("DELETE FROM violation_detection WHERE id = %s", (violation_id,))
        
        # 3. HAPUS GAMBAR DARI LOCAL STORAGE
        image_deletion_success = True
        if image_url:
            image_deletion_success = delete_violation_image(image_url)
        
        if not image_deletion_success:
            logging.warning(f"DB row deleted for ID {violation_id}, but image deletion failed for URL: {image_url}")

        # 4. COMMIT TRANSAKSI DATABASE
        conn.commit()

        # Beri respon sukses
        return jsonify({
            "message": f"Report ID {violation_id} successfully deleted from database.",
            "image_deleted": image_deletion_success
        }), 200

    except Exception as e:
        if conn: 
            conn.rollback() # Rollback jika terjadi error
        logging.error(f"[REPORT_DELETE API ERROR]: {e}")
        return jsonify({"error": f"Failed to delete Report Violation. Detail: {str(e)}"}), 500
    
    finally:
        if cur: cur.close()
        if conn: conn.close()

@reports_bp.route('/reports-delete/batch', methods=['DELETE'])
@require_role(['super_admin'])
def delete_reports_batch():
    """
    API untuk menghapus laporan pelanggaran secara massal (batch).
    Menerima list ID laporan.
    """
    data = request.get_json()
    violation_ids = data.get('ids', [])

    if not violation_ids or not isinstance(violation_ids, list):
        return jsonify({"error": "Invalid or missing 'ids' list in request body."}), 400
    
    conn = None
    cur = None
    deleted_count = 0
    failed_images = 0
    
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Konversi list ID ke tuple untuk query IN (PostgreSQL/SQL)
        placeholders = ', '.join(['%s'] * len(violation_ids))

        # 1. Ambil semua image_url yang akan dihapus
        query_select = f"SELECT id, image FROM violation_detection WHERE id IN ({placeholders})"
        cur.execute(query_select, tuple(violation_ids))
        reports_to_delete = cur.fetchall()

        # 2. Hapus gambar satu per satu dari Local Storage
        for report_id, image_url in reports_to_delete:
            if image_url:
                # delete_violation_image diimpor dari services.cloud_storage
                if not delete_violation_image(image_url): 
                    failed_images += 1
                    logging.warning(f"Failed to delete image for Report ID {report_id} at URL: {image_url}")

        # 3. Hapus data dari database secara massal
        query_delete = f"DELETE FROM violation_detection WHERE id IN ({placeholders})"
        cur.execute(query_delete, tuple(violation_ids))
        deleted_count = cur.rowcount
        
        conn.commit()

        return jsonify({
            "message": f"Successfully deleted {deleted_count} reports.",
            "reports_requested": len(violation_ids),
            "reports_deleted_db": deleted_count,
            "image_deletion_failed": failed_images
        }), 200

    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[REPORTS_BATCH_DELETE API ERROR]: {e}")
        return jsonify({"error": f"Failed to perform batch deletion. Detail: {str(e)}"}), 500
    
    finally:
        if cur: cur.close()
        if conn: conn.close()