import logging
from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor
from db.db_config import get_connection
from utils.auth import require_role

object_bp = Blueprint('object', __name__, url_prefix='/api')
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

@object_bp.route('/object/object_classes', methods=['GET'])
@require_role(['super_admin', 'cctv_editor', 'report_viewer', 'viewer'])
def get_object_classes():
    """
    Mengambil semua data object_class dari database.
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Ambil semua kolom yang relevan
        cursor.execute("""
            SELECT id, name, is_violation, pair_id, color_r, color_g, color_b
            FROM object_class
            ORDER BY id ASC;
        """)
        results = cursor.fetchall()
        
        return jsonify(results)
    
    except Exception as e:
        logging.error(f"Error getting object classes: {str(e)}")
        return jsonify({"error": "Internal Server Error"}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@object_bp.route('/object/object_classes/<int:id>', methods=['PUT'])
@require_role(['super_admin', 'cctv_editor', 'report_viewer', 'viewer'])
def update_object_class(id):
    """
    Memperbarui object_class dan pasangannya (pair_id) secara atomik, dengan validasi input warna.
    """
    data = request.json
    conn = None
    cursor = None
    
    # Nilai yang diperlukan untuk update
    name = data.get('name')
    is_violation = data.get('is_violation')
    
    # Ambil nilai warna
    color_r = data.get('color_r')
    color_g = data.get('color_g')
    color_b = data.get('color_b')
    
    new_pair_id = data.get('new_pair_id')
    old_pair_id = data.get('old_pair_id')
    
    # 1. Validasi Input Dasar
    if not all([name, color_r is not None, color_g is not None, color_b is not None]):
        return jsonify({"error": "Missing required fields"}), 400

    # 2. Validasi Batas Warna (0-255)
    try:
        color_r = int(color_r)
        color_g = int(color_g)
        color_b = int(color_b)
        
        if not (0 <= color_r <= 255 and 0 <= color_g <= 255 and 0 <= color_b <= 255):
            return jsonify({"error": "Color values must be between 0 and 255."}), 400
            
    except ValueError:
        return jsonify({"error": "Color values must be integers."}), 400
        
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # --- Mulai Transaksi ---
        
        # 1. Reset Pair ID Lama
        if old_pair_id and old_pair_id != new_pair_id:
            cursor.execute("UPDATE object_class SET pair_id = NULL WHERE id = %s;", (old_pair_id,))

        # 2. Update Class Utama
        cursor.execute("""
            UPDATE object_class 
            SET name = %s, is_violation = %s, color_r = %s, color_g = %s, color_b = %s, pair_id = %s
            WHERE id = %s;
        """, (name, is_violation, color_r, color_g, color_b, new_pair_id, id))
        
        # 3. Update Class Pasangan
        if new_pair_id:
            cursor.execute("UPDATE object_class SET pair_id = %s WHERE id = %s;", (id, new_pair_id))
        
        conn.commit()
        return jsonify({"message": "Object class and pair updated successfully."})
    
    except Exception as e:
        conn.rollback()
        logging.error(f"Error updating object class {id}: {str(e)}")
        return jsonify({"error": "Database Transaction Failed"}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()