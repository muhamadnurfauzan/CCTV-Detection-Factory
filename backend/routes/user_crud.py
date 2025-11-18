import logging
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor 

from db.db_config import get_connection

# Inisialisasi Blueprint untuk modul user
user_bp = Blueprint('user', __name__, url_prefix='/api')

# Daftar role yang valid
VALID_ROLES = ['super_admin', 'cctv_editor', 'report_viewer', 'viewer']
ROLES_NEEDING_CCTV = ['super_admin', 'cctv_editor', 'report_viewer']

# =========================================================================
# API: ADD USER (/user_add)
# =========================================================================
@user_bp.route('/user_add', methods=['POST'])
def add_user():
    conn = None
    cur = None
    try:
        data = request.json
        
        # Wajib Validasi: Ambil dan validasi semua field wajib
        username = data.get('username').strip() 
        full_name = data.get('full_name').strip()
        email = data.get('email').strip().lower()
        password = data.get('password') 
        role = data.get('role')
        cctv_ids = data.get('cctv_ids', []) # Array of integer IDs
        
        # Validasi Basic
        if not all([username, full_name, email, password, role]):
            return jsonify({"error": "Missing required fields (Username, Name, Email, Password, Role)."}), 400
        if role not in VALID_ROLES:
            return jsonify({"error": f"Invalid role: {role}."}), 400
        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters long."}), 400

        # Logika Pembersihan CCTV 
        if role not in ROLES_NEEDING_CCTV:
            cctv_ids = []
            logging.info(f"Role '{role}' does not require CCTV assignment. Clearing cctv_ids.")

        conn = get_connection()
        cur = conn.cursor()
        
        # 1. Insert User
        cur.execute("INSERT INTO users (username, full_name, email, password, role) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (username, full_name, email, f"HASHED_{password}", role)) 
        new_user_id = cur.fetchone()[0]
        
        # 2. Insert CCTV Mappings (hanya jika ada ID)
        if cctv_ids:
            for cctv_id in cctv_ids:
                cur.execute("INSERT INTO user_cctv_map (user_id, cctv_id) VALUES (%s, %s)",
                            (new_user_id, cctv_id))
        
        conn.commit()
        
        return jsonify({"message": "User added successfully.", "id": new_user_id, "name": full_name}), 201

    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[USER_ADD API ERROR]: {e}")
        return jsonify({"error": "Failed to add user. Check for duplicate username or email or invalid CCTV ID."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


# =========================================================================
# API: UPDATE USER (/user_update/<user_id>)
# =========================================================================
@user_bp.route('/user_update/<user_id>', methods=['PUT'])
def update_user(user_id):
    conn = None
    cur = None
    try:
        data = request.json
        
        # Wajib Validasi: Ambil dan validasi semua field wajib
        username = data.get('username').strip() 
        full_name = data.get('full_name').strip()
        email = data.get('email').strip().lower()
        password = data.get('password') # Opsional
        role = data.get('role')
        cctv_ids = data.get('cctv_ids', []) # Array of integer IDs
        
        # Validasi Basic
        if not all([username, full_name, email, role]):
            return jsonify({"error": "Missing required fields (Username, Name, Email, Role)."}), 400
        if role not in VALID_ROLES:
            return jsonify({"error": f"Invalid role: {role}."}), 400

        # Logika Pembersihan CCTV (Poin 3)
        # Jika role diubah menjadi 'viewer' atau role yang tidak memerlukan map, 
        # kita hapus mapping CCTV yang mungkin dikirim frontend atau yang sudah ada di DB.
        if role not in ROLES_NEEDING_CCTV:
            cctv_ids = []
            logging.info(f"Role changed to '{role}'. All previous CCTV assignments will be cleared.")
            
        conn = get_connection()
        cur = conn.cursor()
        
        # 1. Update User Details
        update_fields = ["username = %s", "full_name = %s", "email = %s", "role = %s"]
        update_params = [username, full_name, email, role]

        if password and len(password) >= 6:
            update_fields.append("password = %s") 
            update_params.append(f"HASHED_{password}") 
        elif password and len(password) < 6:
            return jsonify({"error": "New password must be at least 6 characters long."}), 400

        update_params.append(user_id)
        
        update_query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = %s"
        cur.execute(update_query, update_params)

        # 2. Update CCTV Mappings
        # Hapus semua mapping lama
        cur.execute("DELETE FROM user_cctv_map WHERE user_id = %s", (user_id,))
        
        # Masukkan mapping baru (akan kosong jika cctv_ids sudah di-clear di Poin 3)
        if cctv_ids:
            for cctv_id in cctv_ids:
                cur.execute("INSERT INTO user_cctv_map (user_id, cctv_id) VALUES (%s, %s)",
                            (user_id, cctv_id))
        
        conn.commit()
        
        return jsonify({"message": "User updated successfully.", "name": full_name}), 200

    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[USER_UPDATE API ERROR]: {e}")
        return jsonify({"error": "Failed to update user. Check for duplicate username or email or invalid CCTV ID."}), 500
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

# --- API UNTUK MANAJEMEN USER DENGAN MAPPING CCTV ---
@user_bp.route('/users_with_cctvs', methods=['GET'])
def get_users_with_cctvs():
    conn = None
    cur = None
    try:
        # Ambil parameter dari request
        search_query = request.args.get('search', '')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        
        # Validasi parameter
        if page < 1: page = 1
        # Set limit tetap 10 jika tidak valid
        if limit not in (10, 25, 50): limit = 10 
            
        offset = (page - 1) * limit
        
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1. Tentukan CTE untuk Filtering (Ini menggantikan search_filter_query)
        # filtered_user_ids akan berisi daftar ID user yang cocok dengan search_query
        cte_query = """
            WITH filtered_user_ids AS (
                SELECT DISTINCT u.id
                FROM users u
                LEFT JOIN user_cctv_map ucm ON u.id = ucm.user_id
                LEFT JOIN cctv_data cd ON ucm.cctv_id = cd.id
                WHERE 1=1 
        """
        search_params = []
        if search_query:
            search_term = f"%{search_query}%"
            # Pencarian di Name, Email, Nama CCTV, atau Lokasi CCTV
            cte_query += """
                AND (
                    u.full_name ILIKE %s OR 
                    u.email ILIKE %s OR 
                    cd.name ILIKE %s OR
                    cd.location ILIKE %s
                )
            """
            # Empat parameter untuk empat %s
            search_params.extend([search_term, search_term, search_term, search_term])
        
        cte_query += ")" # Penutup CTE

        
        # 2. Query Total Item (untuk Pagination) menggunakan CTE
        # Jumlah parameter: Sama dengan search_params
        count_query = cte_query + " SELECT COUNT(id) AS total FROM filtered_user_ids"
        
        cur.execute(count_query, search_params) # Eksekusi dengan parameter pencarian
        total_items = cur.fetchone()['total']
        
        # 3. Query Data User dengan Aggregasi CCTV menggunakan CTE
        # Jumlah parameter: Sama dengan search_params + [limit, offset]
        data_query = cte_query + """
            SELECT
                u.id,
                u.username, 
                u.full_name,
                u.email,
                u.role,
                -- Aggregasi data CCTV yang diampu menjadi array JSON
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT('id', cd.id, 'name', cd.name, 'location', cd.location)
                        ORDER BY cd.id
                    ) FILTER (WHERE cd.id IS NOT NULL), 
                    '[]'::json
                ) AS cctvs
            FROM users u
            INNER JOIN filtered_user_ids fuid ON u.id = fuid.id -- Filter hanya ID yang ada di CTE
            LEFT JOIN user_cctv_map ucm ON u.id = ucm.user_id
            LEFT JOIN cctv_data cd ON ucm.cctv_id = cd.id
            GROUP BY u.id, u.full_name, u.email, u.role
            ORDER BY u.full_name ASC
            LIMIT %s OFFSET %s
        """
        
        # Parameter untuk data_query: (parameter pencarian) + (limit) + (offset)
        data_params = search_params + [limit, offset] 
        
        cur.execute(data_query, data_params)
        users = cur.fetchall()

        return jsonify({
            "users": users,
            "totalItems": total_items,
            "currentPage": page,
            "itemsPerPage": limit
        }), 200

    except Exception as e:
        # PENTING: Log detail error (f-string) agar bisa di-debug di server
        logging.error(f"[USER API ERROR]: {e}")
        return jsonify({"error": f"Failed to retrieve user data. Detail: {e}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()