from functools import wraps
from flask import jsonify, request, current_app
import jwt

def require_role(allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.cookies.get('access_token')
            if not token:
                return jsonify({"error": "Token missing"}), 401

            try:
                payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
                user_role = payload.get('role')
                if user_role not in allowed_roles:
                    return jsonify({"error": "Akses ditolak. Role tidak diizinkan."}), 403
            except:
                return jsonify({"error": "Token tidak valid"}), 401

            return f(*args, **kwargs)
        return decorated_function
    return decorator