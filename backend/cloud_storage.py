# cloud_storage.py
import datetime
import uuid
import logging
from supabase import create_client, Client
import config

try:
    supabase: Client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
    logging.info("[Supabase] Koneksi berhasil dibuat.")
except Exception as e:
    logging.error(f"[Supabase] Gagal membuat koneksi: {e}")
    supabase = None

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
        logging.info(f"[Supabase] Upload berhasil: {public_url}")
        return public_url

    except Exception as e:
        logging.error(f"[Supabase] Gagal upload gambar: {e}")
        raise