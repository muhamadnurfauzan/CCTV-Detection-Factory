import logging
from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor
from db.db_config import get_connection

object_bp = Blueprint('object', __name__, url_prefix='/api')
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

@object_bp.route('/object/object_classes', methods=['GET'])
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
def update_object_class(id):
    """
    Memperbarui object_class dan pasangannya (pair_id) secara atomik.
    Data yang diterima: { name, is_violation, color_r, color_g, color_b, new_pair_id }
    """
    data = request.json
    conn = None
    cursor = None
    
    # Nilai yang diperlukan untuk update
    name = data.get('name')
    is_violation = data.get('is_violation')
    color_r = data.get('color_r')
    color_g = data.get('color_g')
    color_b = data.get('color_b')
    new_pair_id = data.get('new_pair_id') # ID pasangan yang baru
    old_pair_id = data.get('old_pair_id') # ID pasangan yang lama (diperlukan untuk reset)
    
    if not all([name, color_r is not None, color_g is not None, color_b is not None]):
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # --- Mulai Transaksi ---
        
        # 1. Reset Pair ID Lama (Jika ada pair lama, set pair_id-nya menjadi NULL)
        if old_pair_id and old_pair_id != new_pair_id:
            cursor.execute("UPDATE object_class SET pair_id = NULL WHERE id = %s;", (old_pair_id,))
            logging.info(f"Resetting pair_id for old pair ID: {old_pair_id}")

        # 2. Update Class Utama
        cursor.execute("""
            UPDATE object_class 
            SET name = %s, is_violation = %s, color_r = %s, color_g = %s, color_b = %s, pair_id = %s
            WHERE id = %s;
        """, (name, is_violation, color_r, color_g, color_b, new_pair_id, id))
        logging.info(f"Updated main class ID: {id} with new pair_id: {new_pair_id}")
        
        # 3. Update Class Pasangan (Jika ada pasangan baru, set pair_id-nya ke ID class utama)
        if new_pair_id:
            cursor.execute("UPDATE object_class SET pair_id = %s WHERE id = %s;", (id, new_pair_id))
            logging.info(f"Updated pair class ID: {new_pair_id} with main class ID: {id}")
        
        conn.commit()
        return jsonify({"message": "Object class and pair updated successfully."})
    
    except Exception as e:
        conn.rollback()
        logging.error(f"Error updating object class {id}: {str(e)}")
        return jsonify({"error": "Database Transaction Failed"}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()