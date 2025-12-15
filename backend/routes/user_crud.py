import logging
import re
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor
from passlib.context import CryptContext 

from db.db_config import get_connection
from utils.auth import require_role

# Inisialisasi Blueprint untuk modul user
user_bp = Blueprint('user', __name__, url_prefix='/api')

# Daftar role yang valid
VALID_ROLES = ['super_admin', 'report_viewer', 'viewer']
ROLES_NEEDING_CCTV = ['super_admin', 'report_viewer']

# Setup password context (Argon2 > bcrypt > fallback)
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# Regex untuk validasi password dan username kuat
GMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@gmail\.com$", re.IGNORECASE)
USERNAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]{7,19}$")
PASSWORD_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$"
)

def is_gmail_email(email: str) -> bool:
    return bool(GMAIL_PATTERN.match(email.strip()))

def is_valid_username(username: str) -> bool:
    return bool(USERNAME_PATTERN.match(username))

def is_valid_password(password: str) -> bool:
    return bool(PASSWORD_PATTERN.match(password))

# =========================================================================
# API: ADD USER (/user-add) — DIPERBAIKI TOTAL
# =========================================================================
@user_bp.route('/user-add', methods=['POST'])
@require_role(['super_admin'])
def add_user():
    conn = None
    cur = None
    try:
        data = request.json
        username = data.get('username', '').strip().lower()
        full_name = data.get('full_name', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password')
        role = data.get('role')
        cctv_ids = data.get('cctv_ids', [])

        # Validasi wajib
        if not all([username, full_name, email, password, role]):
            return jsonify({"error": "All fields are required."}), 400
        
        if not email:
            return jsonify({"error": "Email is required."}), 400

        if not is_gmail_email(email):
            return jsonify({
                "error": "Only Gmail (@gmail.com) emails are allowed.\n"
                         "Example: yourname@gmail.com"
            }), 400
        
        if not username:
            return jsonify({"error": "Username is required."}), 400
        
        if not is_valid_username(username):
            return jsonify({
                "error": "Username must be at least 8 characters and contain: "
                        "only lowercase, number and underscore (_); "
                        "must start with lowercase; "
                        "no space, period or other symbol."
            }), 400

        if role not in VALID_ROLES:
            return jsonify({"error": f"Invalid role: {role}."}), 400

        # Validasi password kuat
        if not is_valid_password(password):
            return jsonify({
                "error": "Password must be at least 8 characters and contain: "
                        "uppercase, lowercase, number and symbol (@$!%*?&)"
            }), 400

        # Bersihkan CCTV jika tidak diperlukan
        if role not in ROLES_NEEDING_CCTV:
            cctv_ids = []

        conn = get_connection()
        cur = conn.cursor()

        # Cek username & email unik
        cur.execute("SELECT id FROM users WHERE username = %s OR email = %s", (username, email))
        if cur.fetchone():
            return jsonify({"error": "Username or email already exists."}), 409

        # Hash password yang benar!
        hashed_password = pwd_context.hash(password)

        # Insert user
        cur.execute("""
            INSERT INTO users (username, full_name, email, password, role)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
        """, (username, full_name, email, hashed_password, role))
        new_user_id = cur.fetchone()[0]

        # Insert CCTV mapping
        if cctv_ids:
            placeholders = ','.join(['(%s, %s)'] * len(cctv_ids))
            query = f"INSERT INTO user_cctv_map (user_id, cctv_id) VALUES {placeholders}"
            params = [(new_user_id, cid) for cid in cctv_ids]
            cur.executemany(query, params)

        conn.commit()
        return jsonify({"message": "User added successfully.", "id": new_user_id}), 201

    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[USER_ADD ERROR]: {e}")
        return jsonify({"error": "Failed to add user."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# =========================================================================
# API: UPDATE USER (/user-update/<user_id>)
# =========================================================================
@user_bp.route('/user-update/<user_id>', methods=['PUT'])
@require_role(['super_admin'])
def update_user(user_id):
    conn = None
    cur = None
    try:
        data = request.json
        username = data.get('username', '').strip().lower()
        full_name = data.get('full_name', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip()
        role = data.get('role')
        cctv_ids = data.get('cctv_ids', [])

        if not all([username, full_name, email, role]):
            return jsonify({"error": "Required fields missing."}), 400

        if not email:
            return jsonify({"error": "Email is required."}), 400

        if not is_gmail_email(email):
            return jsonify({
                "error": "Only Gmail (@gmail.com) emails are allowed.\n"
                         "Example: yourname@gmail.com"
            }), 400
        
        if not username:
            return jsonify({"error": "Username is required."}), 400
        
        if not is_valid_username(username):
            return jsonify({
                "error": "Username must be at least 8 characters and contain: "
                        "only lowercase, number and underscore (_); "
                        "must start with lowercase; "
                        "no space, period or other symbol."
            }), 400
        
        if role not in VALID_ROLES:
            return jsonify({"error": f"Invalid role: {role}."}), 400

        if role not in ROLES_NEEDING_CCTV:
            cctv_ids = []

        conn = get_connection()
        cur = conn.cursor()

        # Cek konflik username/email (kecuali untuk user itu sendiri)
        cur.execute("""
            SELECT id FROM users 
            WHERE (username = %s OR email = %s) AND id != %s
        """, (username, email, user_id))
        if cur.fetchone():
            return jsonify({"error": "Username or email already used by another account."}), 409

        # Update user
        update_fields = ["username = %s", "full_name = %s", "email = %s", "role = %s"]
        params = [username, full_name, email, role]

        if password:
            if not is_valid_password(password):
                return jsonify({"error": "New password does not meet security requirements."}), 400
            update_fields.append("password = %s")
            params.append(pwd_context.hash(password))

        params.append(user_id)
        query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = %s"
        cur.execute(query, params)

        # Update CCTV mapping
        cur.execute("DELETE FROM user_cctv_map WHERE user_id = %s", (user_id,))
        if cctv_ids:
            placeholders = ','.join(['(%s, %s)'] * len(cctv_ids))
            cur.executemany(
                f"INSERT INTO user_cctv_map (user_id, cctv_id) VALUES {placeholders}",
                [(user_id, cid) for cid in cctv_ids]
            )

        conn.commit()
        return jsonify({"message": "User updated successfully."}), 200

    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[USER_UPDATE ERROR]: {e}")
        return jsonify({"error": "Failed to update user."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# =========================================================================
# API: DELETE USER
# =========================================================================
@user_bp.route('/user-delete/<user_id>', methods=['DELETE'])
@require_role(['super_admin'])
def delete_user(user_id):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Cek apakah user yang akan dihapus adalah super_admin
        cur.execute("SELECT role, full_name FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
        if not user:
            return jsonify({"error": "User not found."}), 404

        role, full_name = user

        # CEK: Jika super_admin dan hanya tersisa 1 → DILARANG!
        if role == 'super_admin':
            cur.execute("SELECT COUNT(*) FROM users WHERE role = 'super_admin'")
            super_admin_count = cur.fetchone()[0]
            if super_admin_count <= 1:
                return jsonify({
                    "error": "Cannot delete the last Super Admin. "
                             "There must be at least one Super Admin in the system."
                }), 403

        # Hapus mapping CCTV dulu
        cur.execute("DELETE FROM user_cctv_map WHERE user_id = %s", (user_id,))

        # Hapus user
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        
        conn.commit()
        return jsonify({
            "message": "User deleted successfully.",
            "name": full_name
        }), 200

    except Exception as e:
        if conn: conn.rollback()
        logging.error(f"[USER_DELETE ERROR]: {e}")
        return jsonify({"error": "Failed to delete user."}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# --- API UNTUK MANAJEMEN USER DENGAN MAPPING CCTV ---
@user_bp.route('/users-with-cctvs', methods=['GET'])
@require_role(['super_admin'])
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