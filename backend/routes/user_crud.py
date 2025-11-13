import logging
from flask import Blueprint, request, jsonify

from db.db_config import get_connection

# Inisialisasi Blueprint untuk modul user
user_bp = Blueprint('user', __name__, url_prefix='/api')

# Daftar role yang valid
VALID_ROLES = ['super_admin', 'cctv_editor', 'report_viewer', 'viewer']

# =========================================================================
# API: ADD USER
# =========================================================================
@user_bp.route('/user_add', methods=['POST'])
def add_user():
    conn = None
    cur = None
    try:
        data = request.json
        username = data.get('username').strip() # Kolom baru
        full_name = data.get('full_name').strip()
        email = data.get('email').strip().lower()
        password = data.get('password') # Password harus di-hash di backend!
        role = data.get('role')
        cctv_ids = data.get('cctv_ids', []) # Array of integer IDs
        
        # Validasi
        if not all([username, full_name, email, password, role]):
            return jsonify({"error": "Missing required fields (Username, Name, Email, Password, Role)."}), 400
        if role not in VALID_ROLES:
            return jsonify({"error": f"Invalid role: {role}."}), 400
        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters long."}), 400

        conn = get_connection()
        cur = conn.cursor()
        
        # 1. Insert User (Asumsi: 'id' di-generate otomatis)
        # Ganti dengan logika INSERT dan HASH PASSWORD yang benar
        cur.execute("INSERT INTO users (username, full_name, email, password, role) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (username, full_name, email, f"HASHED_{password}", role)) 
        new_user_id = cur.fetchone()[0]
        
        # 2. Insert CCTV Mappings
        for cctv_id in cctv_ids:
            cur.execute("INSERT INTO user_cctv_map (user_id, cctv_id) VALUES (%s, %s)",
                        (new_user_id, cctv_id))
        
        conn.commit()
        
        return jsonify({"message": "User added successfully.", "id": new_user_id, "name": full_name}), 201

    except NotImplementedError:
        return jsonify({"error": "Database functionality not ready."}), 500
    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[USER_ADD API ERROR]: {e}")
        # Pesan error yang lebih spesifik untuk constraint (misal: duplicate username/email)
        return jsonify({"error": "Failed to add user. Check for duplicate username or email."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


# =========================================================================
# API: UPDATE USER
# =========================================================================
@user_bp.route('/user_update/<user_id>', methods=['PUT'])
def update_user(user_id):
    conn = None
    cur = None
    try:
        data = request.json
        username = data.get('username').strip() # Kolom baru
        full_name = data.get('full_name').strip()
        email = data.get('email').strip().lower()
        password = data.get('password') # Opsional
        role = data.get('role')
        cctv_ids = data.get('cctv_ids', []) # Array of integer IDs
        
        # Validasi dasar
        if not all([username, full_name, email, role]):
            return jsonify({"error": "Missing required fields (Username, Name, Email, Role)."}), 400
        if role not in VALID_ROLES:
            return jsonify({"error": f"Invalid role: {role}."}), 400

        conn = get_connection()
        cur = conn.cursor()
        
        # 1. Update User Details
        update_fields = ["username = %s", "full_name = %s", "email = %s", "role = %s"]
        update_params = [username, full_name, email, role]

        if password and len(password) >= 6:
            update_fields.append("password = %s") # HASH PASSWORD
            update_params.append(f"HASHED_{password}") # Ganti dengan hash yang benar
        elif password and len(password) < 6:
            return jsonify({"error": "New password must be at least 6 characters long."}), 400

        update_params.append(user_id)
        
        update_query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = %s"
        cur.execute(update_query, update_params)

        # 2. Update CCTV Mappings
        # Hapus semua mapping lama
        cur.execute("DELETE FROM user_cctv_map WHERE user_id = %s", (user_id,))
        
        # Masukkan mapping baru
        for cctv_id in cctv_ids:
            cur.execute("INSERT INTO user_cctv_map (user_id, cctv_id) VALUES (%s, %s)",
                        (user_id, cctv_id))
        
        conn.commit()
        
        return jsonify({"message": "User updated successfully.", "name": full_name}), 200

    except NotImplementedError:
        return jsonify({"error": "Database functionality not ready."}), 500
    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[USER_UPDATE API ERROR]: {e}")
        return jsonify({"error": "Failed to update user. Check for duplicate username or email."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


# =========================================================================
# API: DELETE USER
# =========================================================================
@user_bp.route('/user_delete/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # 1. Hapus mapping CCTV terkait (Foreign Key akan mencegah user terhapus jika mapping masih ada)
        cur.execute("DELETE FROM user_cctv_map WHERE user_id = %s", (user_id,))
        
        # 2. Hapus User
        cur.execute("DELETE FROM users WHERE id = %s RETURNING full_name", (user_id,))
        deleted_user = cur.fetchone()

        if not deleted_user:
            return jsonify({"error": "User not found."}), 404
        
        deleted_name = deleted_user[0]
        conn.commit()
        
        return jsonify({"message": "User deleted successfully.", "id": user_id, "name": deleted_name}), 200

    except NotImplementedError:
        return jsonify({"error": "Database functionality not ready."}), 500
    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[USER_DELETE API ERROR]: {e}")
        return jsonify({"error": "Failed to delete user."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()