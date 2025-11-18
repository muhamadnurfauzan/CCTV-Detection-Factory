# backend/services/notification_service.py
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
import requests
import logging
from db.db_config import get_connection
from shared import state

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# --- 1. Fungsi Utama Pengiriman Email ---

def send_violation_notification(recipient_email, subject, body_html, image_bytes=None, image_filename=None):
    """
    Mengirim email notifikasi dengan opsi melampirkan gambar.
    """
    email_cfg = state.GLOBAL_EMAIL_CONFIG
    logging.info(f"[EMAIL DEBUG] Config saat kirim → host={email_cfg.get('host')}, user={email_cfg.get('user')}, from={email_cfg.get('from')}")
    if not all([email_cfg['host'], email_cfg['user'], email_cfg['pass']]):
        logging.error("ERROR: Konfigurasi EMAIL (HOST/USER/PASS) belum lengkap!")
        return False
        
    try:
        # Membuat objek MIMEMultipart
        msg = MIMEMultipart('related')
        
        # --- PERBAIKAN 1: Ganti EMAIL_FROM yang lama dengan email_cfg['from'] ---
        msg['From'] = email_cfg['from']
        msg['To'] = recipient_email
        msg['Subject'] = subject
        
        # Tambahkan body HTML (untuk konten dan gambar inline)
        msg.attach(MIMEText(body_html, 'html'))

        # Tambahkan attachment (jika ada)
        if image_bytes and image_filename:
            # Lampirkan gambar sebagai attachment (bukan inline)
            img = MIMEImage(image_bytes, name=image_filename)
            img.add_header('Content-Disposition', 'attachment', filename=image_filename)
            msg.attach(img)
            
        # Koneksi dan kirim via SMTP
        if email_cfg['port'] == 587:
            server = smtplib.SMTP(email_cfg['host'], email_cfg['port'])
            server.starttls()
        elif email_cfg['port'] == 465:
            server = smtplib.SMTP_SSL(email_cfg['host'], email_cfg['port'])

        # --- PERBAIKAN 2: Hapus redundansi server.starttls() yang ada di luar if/else ---        
        server.login(email_cfg['user'], email_cfg['pass'])
        server.sendmail(email_cfg['from'], recipient_email, msg.as_string())
        server.quit()
        
        logging.info(f"[EMAIL] SUCCESS: Email terkirim ke {recipient_email} untuk {subject}")
        return True
    
    except Exception as e:
        logging.error(f"[EMAIL] FAILED: Gagal mengirim email ke {recipient_email}: {e}")
        return False

# --- 2. Fungsi Helper untuk Mengunduh Gambar ---

def download_image_from_url(url):
    """Mengunduh file gambar dari URL (Supabase) dan mengembalikan bytes-nya."""
    try:
        # Gunakan requests.get untuk mengunduh gambar
        response = requests.get(url, stream=True, timeout=10)
        response.raise_for_status() 
        return response.content
    except requests.exceptions.RequestException as e:
        logging.error(f"[DOWNLOAD] Gagal mengunduh gambar dari {url}: {e}")
        return None

# --- 3. Fungsi Logika Utama (API Call) ---

def notify_user_by_violation_id(violation_id):
    """
    Mengambil data pelanggaran, mencari penerima, dan mengirim email.
    Digunakan untuk notifikasi manual (API).
    """
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # 1. Ambil detail Pelanggaran, CCTV, dan Tipe Pelanggaran
        cur.execute("""
            SELECT 
                vd.timestamp, vd.image AS image_url,
                cd.id AS cctv_id, cd.name AS cctv_name, cd.location,
                oc.name AS violation_name
            FROM violation_detection vd
            JOIN cctv_data cd ON vd.id_cctv = cd.id
            JOIN object_class oc ON vd.id_violation = oc.id
            WHERE vd.id = %s
        """, (violation_id,))
        violation_data = cur.fetchone()

        if not violation_data:
            logging.warning(f"[EMAIL] Pelanggaran ID {violation_id} tidak ditemukan.")
            return False

        # 2. Cari Penerima (User yang bertanggung jawab atas CCTV ini)
        cur.execute("""
            SELECT u.email, u.full_name
            FROM user_cctv_map ucm
            JOIN users u ON ucm.user_id = u.id
            WHERE ucm.cctv_id = %s
        """, (violation_data[2],)) # cctv_id adalah index ke-2
        
        recipients = cur.fetchall()

        if not recipients:
            logging.warning(f"[EMAIL] Tidak ada user yang di-map ke CCTV ID {violation_data[2]}.")
            return False
            
        # 3. Download Gambar
        image_bytes = download_image_from_url(violation_data[1]) # image_url adalah index ke-1
        image_filename = f"violation_{violation_id}_{violation_data[5]}.jpg" # violation_name index ke-4

        # 4. Susun dan Kirim Email ke Semua Penerima
        cctv_name = violation_data[3] # cctv_name index ke-3
        location = violation_data[4] # location index ke-4
        violation_name = violation_data[5] # violation_name index ke-5
        timestamp = violation_data[0].strftime("%Y-%m-%d %H:%M:%S")

        subject = f"[Important] PPE Violation: {violation_name.upper()} at {cctv_name}"
        success_count = 0

        # --- LOOP Pengiriman Email (Kirim personal ke setiap penerima) ---
        for email, full_name in recipients:
        # HTML Body
            html_body = f"""
            <html>
                <body>
                    <p>Dear Mr./Ms. {full_name},</p>
                    <p>A <strong>PPE Violation</strong> has been detected in your area of ​​responsibility:</p>
                    <hr>
                    <p><strong>Violation Type:</strong> {violation_name.upper()}</p>
                    <p><strong>CCTV Location:</strong> {cctv_name} ({location})</p>
                    <p><strong>Time of Incident</strong> {timestamp} WIB</p>
                    <hr>
                    <p>Please verify and follow up immediately. Image evidence of the violation is attached to this email.</p>
                    <p>Thank you for your attention.</p>
                    <p><small>This message was sent automatically by the PPE Detection System, please do not reply.</small></p>
                </body>
            </html>
            """

            if send_violation_notification(email, subject, html_body, image_bytes, image_filename):
                success_count += 1
                
        return success_count > 0

    except Exception as e:
        logging.error(f"[EMAIL SERVICE] Error di notify_user_by_violation_id: {e}")
        return False
    finally:
        if cur: cur.close()
        if conn: conn.close()