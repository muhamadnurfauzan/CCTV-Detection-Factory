# utils/jwt_utils.py
import jwt
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
from flask import make_response

# Load environment variables
load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET", "fallback-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12 
REFRESH_TOKEN_EXPIRE_DAYS = 7

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def set_tokens_in_cookies(resp, access_token, refresh_token):
    resp.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=True,      
        samesite="Lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    resp.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=True,
        samesite="Lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )
    return resp