import os
import datetime
import uuid
import logging

# Tentukan root folder untuk penyimpanan gambar
# Disarankan menggunakan path absolut atau relatif terhadap root backend
BASE_STORAGE_PATH = os.path.join(os.getcwd(), "public", "cctv")

def upload_violation_image(image_bytes: bytes, cctv_id: int, violation_type: str) -> str:
    """
    Menyimpan gambar ke direktori lokal: 
    public/cctv/[cctv_id]/[year]/[month]/[day]/[filename].jpg
    """
    try:
        now = datetime.datetime.now()
        year = now.strftime("%Y")
        month = now.strftime("%m")
        day = now.strftime("%d")
        
        # 1. Buat Path Folder
        folder_path = os.path.join(BASE_STORAGE_PATH, str(cctv_id), year, month, day)
        
        # 2. Pastikan Folder Tersedia (mkdir -p)
        os.makedirs(folder_path, exist_ok=True)
        
        # 3. Buat Nama File Unik
        unique_name = f"{violation_type}_{now:%H%M%S}_{uuid.uuid4().hex[:8]}.jpg"
        file_full_path = os.path.join(folder_path, unique_name)
        
        # 4. Simpan Byte Gambar ke File
        with open(file_full_path, "wb") as f:
            f.write(image_bytes)
            
        # 5. Kembalikan Path Relatif untuk disimpan di Database
        # Ini penting agar saat server pindah, path tetap valid
        relative_path = f"{cctv_id}/{year}/{month}/{day}/{unique_name}"
        logging.info(f"[LOCAL STORAGE] Gambar disimpan di: {relative_path}")
        
        return relative_path

    except Exception as e:
        logging.error(f"[LOCAL STORAGE] Gagal menyimpan gambar: {e}")
        raise

def delete_violation_image(relative_path: str) -> bool:
    """Menghapus file gambar dari penyimpanan lokal."""
    try:
        file_path = os.path.join(BASE_STORAGE_PATH, relative_path)
        if os.path.exists(file_path):
            os.remove(file_path)
            logging.info(f"[LOCAL STORAGE] Berhasil menghapus: {relative_path}")
        return True
    except Exception as e:
        logging.error(f"[LOCAL STORAGE] Gagal menghapus file {relative_path}: {e}")
        return False