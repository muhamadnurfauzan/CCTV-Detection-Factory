# routes/auth_routes.py
import jwt
from functools import wraps
from flask import Blueprint, request, jsonify, make_response, current_app
from passlib.context import CryptContext

from utils.jwt_utils import create_access_token, create_refresh_token, set_tokens_in_cookies
from db.db_config import get_connection

auth_bp = Blueprint('auth', __name__, url_prefix='/api')
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, username, full_name, role, password FROM users WHERE username = %s", (username,))
        user = cur.fetchone()
        if not user or not pwd_context.verify(password, user[4]):
            return jsonify({"error": "Incorrect username or password."}), 401

        user_id, _, full_name, role, _ = user
        access_token = create_access_token({"sub": str(user_id), "role": role})
        refresh_token = create_refresh_token({"sub": str(user_id)})

        resp = make_response(jsonify({
            "message": "Login successfully",
            "user": {"id": str(user_id), "username": username, "full_name": full_name, "role": role}
        }), 200)
        return set_tokens_in_cookies(resp, access_token, refresh_token)

    finally:
        cur.close()
        conn.close()

@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    access_token = request.cookies.get('access_token')
    if not access_token:
        return jsonify({"error": "Token lost"}), 401

    try:
        payload = jwt.decode(access_token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
        if payload.get("type") != "access":
            return jsonify({"error": "Invalid token"}), 401

        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, username, full_name, role FROM users WHERE id = %s", (payload["sub"],))
        user = cur.fetchone()
        cur.close()
        conn.close()

        if not user:
            return jsonify({"error": "User not found"}), 401

        return jsonify({
            "id": str(user[0]),
            "username": user[1],
            "full_name": user[2],
            "role": user[3]
        })

    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401
    
@auth_bp.route('/refresh', methods=['POST'])
def refresh_token():
    refresh_token = request.cookies.get('refresh_token')
    if not refresh_token:
        return jsonify({"error": "Refresh token lost"}), 401

    try:
        payload = jwt.decode(refresh_token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
        if payload.get("type") != "refresh":
            return jsonify({"error": "Invalid token"}), 401

        # Buat token baru
        access_token = create_access_token({"sub": payload["sub"], "role": payload.get("", "viewer")})
        refresh_token_new = create_refresh_token({"sub": payload["sub"]})

        resp = make_response(jsonify({"message": "Token updated"}), 200)
        return set_tokens_in_cookies(resp, access_token, refresh_token_new)

    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Refresh token expired, please re-login"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401
    
@auth_bp.route('/logout', methods=['POST'])
def logout():
    resp = make_response(jsonify({"message": "Logout successfully"}), 200)
    resp.set_cookie("access_token", "", expires=0, httponly=True, secure=True, samesite="Lax")
    resp.set_cookie("refresh_token", "", expires=0, httponly=True, secure=True, samesite="Lax")
    return resp