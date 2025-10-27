# cloud_storage.py (perbaikan)
import io
import os
import tempfile
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
    """
    Upload image hasil deteksi pelanggaran ke Supabase Storage dan mengembalikan URL publiknya.
    Kompatibel dengan supabase-py versi lama (hanya menerima path file).
    """
    if supabase is None:
        raise RuntimeError("Supabase client belum diinisialisasi.")

    now = datetime.datetime.utcnow()
    date_path = now.strftime("%Y/%m/%d")
    unique_name = f"{violation_type}_{now:%H%M%S}_{uuid.uuid4().hex[:8]}.jpg"
    file_path = f"cctv/{cctv_id}/{date_path}/{unique_name}"

    try:
        # Simpan sementara ke file temp
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            tmp_file.write(image_bytes)
            tmp_file.flush()
            temp_filename = tmp_file.name

        # Upload file temp ke Supabase Storage
        res = supabase.storage.from_(config.SUPABASE_BUCKET).upload(file_path, temp_filename)

        # Hapus file temp setelah upload
        os.remove(temp_filename)

        # Validasi hasil
        if hasattr(res, "status_code") and res.status_code not in [200, 201]:
            raise RuntimeError(f"Gagal upload ke Supabase (status={res.status_code}): {res}")

        # Dapatkan URL publik
        public_url = supabase.storage.from_(config.SUPABASE_BUCKET).get_public_url(file_path)
        logging.info(f"[Supabase] Upload berhasil: {public_url}")
        return public_url

    except Exception as e:
        logging.error(f"[Supabase] Gagal upload gambar: {e}")
        raise
