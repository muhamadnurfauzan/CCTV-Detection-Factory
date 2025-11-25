# cloud_storage.py
import datetime
import logging
import uuid
import re
from supabase import create_client, Client
import config

try:
    supabase: Client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
except Exception as e:
    logging.warning(f"[Supabase] Gagal membuat koneksi: {e}")
    supabase = None

# --- FUNGSI UNTUK MENAMBAHKAN GAMBAR KE SUPABASE STORAGE ---
def upload_violation_image(image_bytes: bytes, cctv_id: int, violation_type: str) -> str:
    if supabase is None:
        raise RuntimeError("Supabase client belum diinisialisasi.")

    # GMT+7
    # gmt7 = datetime.timezone(datetime.timedelta(hours=7), "GMT+7")
    # now = datetime.datetime.now(gmt7)

    now = datetime.datetime.now()
    date_path = now.strftime("%Y/%m/%d")
    unique_name = f"{violation_type}_{now:%H%M%S}_{uuid.uuid4().hex[:8]}.jpg"
    file_path = f"cctv/{cctv_id}/{date_path}/{unique_name}"

    try:
        file_options = {
            "content-type": "image/jpeg",
            "upsert": "true",  
            "cache-control": "3600"  
        }
        res = supabase.storage.from_(config.SUPABASE_BUCKET).upload(
            path=file_path,  # Path first (v2)
            file=image_bytes,
            file_options=file_options
        )

        # Hybrid check: v2 bisa dict {data, error} atau httpx.Response
        if isinstance(res, dict):
            if res.get("error"):
                raise RuntimeError(f"Gagal upload: {res['error']}")
        elif hasattr(res, "status_code") and res.status_code not in [200, 201]:
            error_detail = res.json().get("message", "Unknown")
            raise RuntimeError(f"Gagal upload (status={res.status_code}): {error_detail}")

        public_url = supabase.storage.from_(config.SUPABASE_BUCKET).get_public_url(file_path)
        return public_url

    except Exception as e:
        logging.error(f"[Supabase] Gagal upload gambar: {e}")
        raise

# --- FUNGSI UNTUK MENGHAPUS GAMBAR DARI SUPABASE STORAGE ---
def delete_violation_image(image_url: str) -> bool:
    """
    Menghapus file gambar dari Supabase Storage berdasarkan public URL.
    Mengembalikan True jika penghapusan berhasil atau jika file tidak ditemukan.
    """
    if supabase is None:
        logging.error("[Supabase] ERROR: Supabase client belum diinisialisasi.")
        return False

    # 1. Ekstrak path yang diperlukan untuk penghapusan
    match = re.search(r'/public/(.+)', image_url)
    if not match:
        logging.warning(f"[Supabase] WARNING: Gagal mengekstrak path dari URL: {image_url}. Menganggap URL tidak valid.")
        return True # Anggap sukses jika URL tidak valid

    storage_path_full = match.group(1) 
    
    parts = storage_path_full.split('/', 1)
    bucket_name = parts[0]
    path_in_bucket = parts[1] if len(parts) > 1 else None

    if not path_in_bucket or bucket_name != config.SUPABASE_BUCKET:
        logging.warning(f"[Supabase] WARNING: Path tidak lengkap atau bucket mismatch: {storage_path_full}")
        return True 

    try:
        res = supabase.storage.from_(bucket_name).remove([path_in_bucket]) 

        if res is not None and len(res) > 0 and 'error' in res[0] and res[0]['error']:
             # Beberapa error bisa muncul, misalnya permission denied
             raise RuntimeError(f"Gagal menghapus file: {res[0]['message']}")

        logging.info(f"[Supabase] SUCCESS: File {path_in_bucket} berhasil dihapus.")
        return True

    except Exception as e:
        # Tangani error jaringan, otorisasi, atau server Supabase
        logging.error(f"[Supabase] ERROR menghapus gambar {path_in_bucket}: {e}")
        return False