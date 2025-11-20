import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables dari file .env
load_dotenv()

# --- PostgreSQL Connection ---
def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT"),
        sslmode="require"  
    )

