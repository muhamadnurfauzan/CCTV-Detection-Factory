# backend/services/notification_service.py
import smtplib
from datetime import datetime
from string import Template
from psycopg2.extras import RealDictCursor

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch, cm 
from io import BytesIO

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.application import MIMEApplication 
import requests
import logging
from db.db_config import get_connection
from shared_state import state
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# --- 1. Fungsi Utama Pengiriman Email ---

def send_notification_with_attachment(recipient_email, subject, body_html, attachment_bytes=None, attachment_filename=None, mime_type=None):
    """
    Mengirim email notifikasi dengan opsi melampirkan file apapun (gambar, PDF, dll).
    mime_type harus dispesifikasikan (e.g., 'image/jpeg' atau 'application/pdf').
    """
    email_cfg = state.GLOBAL_EMAIL_CONFIG
    logging.info(f"[EMAIL DEBUG] Config saat kirim → host={email_cfg.get('host')}, user={email_cfg.get('user')}, from={email_cfg.get('from')}")
    if not all([email_cfg['host'], email_cfg['user'], email_cfg['pass']]):
        logging.error("ERROR: Konfigurasi EMAIL (HOST/USER/PASS) belum lengkap!")
        return False
        
    try:
        # Membuat objek MIMEMultipart
        msg = MIMEMultipart('related')
        
        msg['From'] = email_cfg['from']
        msg['To'] = recipient_email
        msg['Subject'] = subject
        
        # Tambahkan body HTML (untuk konten)
        msg.attach(MIMEText(body_html, 'html'))

        # Tambahkan attachment (jika ada)
        if attachment_bytes and attachment_filename and mime_type:
            
            # Tentukan tipe MIME yang sesuai
            if mime_type.startswith('image/'):
                part = MIMEImage(attachment_bytes, name=attachment_filename)
            elif mime_type == 'application/pdf':
                part = MIMEApplication(attachment_bytes, name=attachment_filename)
            else:
                # Fallback untuk tipe file lain
                part = MIMEApplication(attachment_bytes, name=attachment_filename)
                
            part.add_header('Content-Disposition', 'attachment', filename=attachment_filename)
            msg.attach(part)
            
        # Koneksi dan kirim via SMTP
        if email_cfg['port'] == 587:
            server = smtplib.SMTP(email_cfg['host'], email_cfg['port'])
            server.starttls()
        elif email_cfg['port'] == 465:
            server = smtplib.SMTP_SSL(email_cfg['host'], email_cfg['port'])

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

# --- 3. Fungsi Ambil Template Email ---

def get_email_template(template_key='ppe_violation'): # Default ke 'ppe_violation'
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT subject_template, body_template 
            FROM email_templates 
            WHERE template_key = %s AND (is_active = true OR is_active IS NULL)
            LIMIT 1
        """, (template_key,))
        row = cur.fetchone()
        if row:
            return row['subject_template'], row['body_template']
        else:
            # Fallback jika template tidak ditemukan
            logging.warning(f"Template key '{template_key}' not found, using fallback.")
            return (
                f"[FALLBACK] Report {template_key} - {template_key}",
                "<h1>FALLBACK TEMPLATE</h1><p>Template not found.</p>"
            )
    finally:
        cur.close()
        conn.close()

# --- 4. Fungsi Logika Utama (API Call) ---

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

        success_count = 0
        subject_template, body_template = get_email_template()  # ambil sekali di luar loop (efisien)

        for recipient_email, full_name in recipients:
            # Context dibuat PER PENERIMA
            context = {
                'full_name': full_name or "Bapak/Ibu", 
                'violation_name': violation_name.upper(),
                'cctv_name': cctv_name,
                'location': location or "Unknown",
                'timestamp': timestamp,
                'violation_id': violation_id,
            }

            subject = Template(subject_template).safe_substitute(context)
            html_body = Template(body_template).safe_substitute(context)


            if send_notification_with_attachment(
                recipient_email, 
                subject, 
                html_body, 
                attachment_bytes=image_bytes, 
                attachment_filename=image_filename, 
                mime_type='image/jpeg'
            ):
                success_count += 1
                            
        return success_count > 0

    except Exception as e:
        logging.error(f"[EMAIL SERVICE] Error di notify_user_by_violation_id: {e}")
        return False
    finally:
        if cur: cur.close()
        if conn: conn.close()

def get_violations_for_user(user_id, start_date, end_date, effective_cctv_ids=None):
    
    """
    Mengambil detail pelanggaran.
    Jika effective_cctv_ids diisi, kita override filter CCTV berdasarkan daftar tersebut,
    BUKAN hanya berdasarkan mapping user.
    """
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        if not effective_cctv_ids:
            return []

        # Pastikan list berisi integer
        numeric_ids = [int(i) for i in effective_cctv_ids if str(i).isdigit()]

        cur.execute("""
            SELECT
                vd.id AS violation_id,
                vd.timestamp,
                cd.name AS cctv_name,
                cd.location,
                oc.name AS violation_name,
                vd.image AS image_url
            FROM violation_detection vd
            JOIN cctv_data cd ON vd.id_cctv = cd.id
            JOIN object_class oc ON vd.id_violation = oc.id
            WHERE vd.timestamp >= %s
              AND vd.timestamp <= %s
              AND vd.id_cctv = ANY(%s)
            ORDER BY vd.timestamp DESC
        """, (start_date, end_date, numeric_ids))

        rows = cur.fetchall()
        
        # LOGIKA ALERT: Jika data kosong, catat di log server
        if not rows:
            logging.info(f"[RECAP] No data found for user {user_id} between {start_date} - {end_date}")
            
        return rows
    
    except Exception as e:
        logging.error(f"[RECAP DATA] Gagal mengambil data pelanggaran untuk user {user_id}: {e}")
        return []
    finally:
        cur.close()
        conn.close()

def generate_violation_pdf(violations_data, full_name, start_date, end_date):
    """
    Membuat PDF Laporan Rekapitulasi Pelanggaran yang formal dengan gambar.
    """
    buffer = BytesIO()
    
    # 1. Konfigurasi Dokumen
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        rightMargin=72, leftMargin=72,
        topMargin=72, bottomMargin=72
    )
    styles = getSampleStyleSheet()
    styles['Normal'].fontName = 'Times-Roman'
    styles['h3'].fontName = 'Times-Bold' 
    
    styles.add(ParagraphStyle(
        name='Heading1Centered', 
        alignment=1, 
        fontSize=16, 
        fontName='Times-Bold', 
        spaceAfter=12
    ))
    styles.add(ParagraphStyle(name='NormalSmall', fontSize=9, fontName='Times-Roman'))
    
    elements = []

    # 2. Header Utama (Judul Laporan)
    elements.append(Paragraph("<b>PPE VIOLATION SUMMARY REPORT</b>", styles['Heading1Centered']))
    elements.append(Paragraph(f"<b>Recipient:</b> {full_name}", styles['Normal']))
    elements.append(Paragraph(f"<b>Reporting Period:</b> {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}", styles['Normal']))
    elements.append(Paragraph(f"<b>Total Violations Recorded:</b> {len(violations_data)}", styles['Normal']))
    elements.append(Spacer(1, 0.3 * inch))

    IMAGE_HEIGHT_CM = 8
    IMAGE_HEIGHT_INCH = IMAGE_HEIGHT_CM / 2.54

    # 3. Loop untuk Setiap Pelanggaran
    violation_count = 0
    for violation in violations_data:
        violation_count += 1
        
        # --- Sub-Header (Judul Pelanggaran) ---
        elements.append(Paragraph(
            f"<b>{violation_count}. Type Violation: {violation['violation_name'].upper()}</b>", 
            styles['h3']
        ))

        # --- Tabel Detail Pelanggaran ---
        table_data = [
            ['CCTV Location:', f"{violation['cctv_name']} ({violation['location'] or '-'})"],
            ['Time of Incident:', violation['timestamp'].strftime("%Y-%m-%d %H:%M:%S")]
        ]
        
        detail_table = Table(table_data, colWidths=[1.5*inch, 4.5*inch])
        detail_table.setStyle(TableStyle([
            ('FONTNAME', (0,0), (-1,-1), 'Times-Roman'),
            ('FONTNAME', (0,0), (0,-1), 'Times-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.lightgrey),
            ('BACKGROUND', (0,0), (0,-1), colors.lightgrey),
        ]))
        elements.append(detail_table)
        elements.append(Spacer(1, 0.1 * inch))

        # --- Lampiran Gambar ---
        if violation['image_bytes']:
            img_stream = BytesIO(violation['image_bytes'])
            
            try:
                img = Image(img_stream)
                aspect_ratio = img.drawHeight / img.drawWidth 
                
                img.drawHeight = IMAGE_HEIGHT_INCH * inch 
                img.drawWidth = img.drawHeight / aspect_ratio 
                
                elements.append(img)
                
            except Exception as e:
                logging.error(f"Failed to process images for PDF: {e}")
                elements.append(Paragraph("<b>Visual Evidence:</b> <font color='red'>Image Failed to Attach/Found. (Error Processing)</font>", styles['Normal']))
                
        else:
            elements.append(Paragraph("<b>Visual Evidence:</b> <font color='red'>Image Failed to Attach/Found.</font>", styles['Normal']))
        
        elements.append(Spacer(1, 0.1 * inch))

    # 4. Build Dokumen
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

def resolve_effective_cctvs(cur, user_id, requested_cctv_ids):
    # Jika TIDAK ADA filter CCTV dari frontend (Case Weekly/Monthly Auto)
    # Ambil SEMUA mapping CCTV untuk user tersebut dari DB
    if not requested_cctv_ids:
        cur.execute("SELECT cctv_id FROM user_cctv_map WHERE user_id = %s", (user_id,))
        return [row['cctv_id'] for row in cur.fetchall()]

    try:
        numeric_ids = [int(id) for id in requested_cctv_ids if str(id).isdigit()]
        if not numeric_ids:
            return []

        cur.execute("""
            SELECT cctv_id FROM user_cctv_map
            WHERE user_id = %s AND cctv_id = ANY(%s)
        """, (user_id, numeric_ids))
        return [row['cctv_id'] for row in cur.fetchall()]
    except Exception as e:
        logging.error(f"[RECAP] Error resolve CCTV: {e}")
        return []

def send_violation_recap_emails(
    start_date: datetime,
    end_date: datetime,
    template_key: str,
    selected_user_ids: list = None,
    selected_cctv_ids: list = None
):
    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        subject_template, body_template = get_email_template(template_key)
        logging.info(f"[RECAP SERVICE] Menggunakan template_key='{template_key}' untuk subjek dan body email.")

        # --- 1. Ambil kandidat user ---
        if selected_user_ids:
            placeholders = ', '.join(['%s'] * len(selected_user_ids))
            cur.execute(f"""
                SELECT id AS user_id, email, full_name
                FROM users
                WHERE id IN ({placeholders})
            """, selected_user_ids)
        else:
            cur.execute("""
                SELECT DISTINCT u.id AS user_id, u.email, u.full_name
                FROM users u
                JOIN user_cctv_map ucm ON u.id = ucm.user_id
            """)

        if selected_user_ids == []:
            logging.warning(
                "[RECAP] selected_user_ids kosong dikirim frontend — kontrak API dilanggar"
            )

        logging.info(
            f"[RECAP DEBUG] selected_user_ids={selected_user_ids}, selected_cctv_ids={selected_cctv_ids}"
        )
        
        recipients = cur.fetchall()
        success_count = 0

        for user in recipients:
            user_id = user['user_id']
            email = user['email']
            full_name = user['full_name']

            # --- 2. Tentukan CCTV efektif untuk user ini ---
            effective_cctv_ids = resolve_effective_cctvs(
                cur,
                user_id,
                selected_cctv_ids
            )
            logging.info(f"[DEBUG] User {user_id} has effective CCTVs: {effective_cctv_ids}")

            if effective_cctv_ids == []:
                continue 
            
            logging.debug(
                f"[RECAP] User {user_id} CCTV scope: {effective_cctv_ids or 'ALL_ASSIGNED'}"
            )

            violations = get_violations_for_user(
                user_id,
                start_date,
                end_date,
                effective_cctv_ids
            )

            if not violations:
                continue

            for v in violations:
                v['image_bytes'] = download_image_from_url(v['image_url']) if v['image_url'] else None

            # --- 3. Generate PDF ---
            pdf_bytes = generate_violation_pdf(violations, full_name, start_date, end_date)

            # --- 4. Susun dan Kirim Email ---
            context = {
                'full_name': full_name or "Bapak/Ibu",
                'start_date': start_date.strftime("%Y-%m-%d"),
                'end_date': end_date.strftime("%Y-%m-%d"),
                'template_key': template_key
            }

            subject = Template(subject_template).safe_substitute(context)
            body = Template(body_template).safe_substitute(context)

            if send_notification_with_attachment(
                email,
                subject,
                body,
                pdf_bytes,
                f"PPE_Report_{template_key}_{start_date:%Y%m%d}_{end_date:%Y%m%d}.pdf",
                'application/pdf'
            ):
                success_count += 1

        logging.info(
            f"Selesai mengirim {success_count} email rekap dari {len(recipients)} kandidat user."
        )
        return success_count > 0

    except Exception as e:
        logging.error(f"[RECAP SERVICE] Error: {e}")
        return False
    finally:
        if cur: cur.close()
        if conn: conn.close()