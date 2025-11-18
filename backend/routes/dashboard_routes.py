import logging
import datetime

from flask import Blueprint, jsonify
from psycopg2.extras import RealDictCursor

from db.db_config import get_connection

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api')

@dashboard_bp.route('/dashboard/summary_today')
def summary_today():
    """
    1. Menunjukkan total pelanggaran (SUM(total_violation)) berdasarkan jenis violation (id_violation)
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        # FIX: Menggunakan cursor_factory untuk psycopg2
        cursor = conn.cursor(cursor_factory=RealDictCursor) 
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        logging.info(f"Querying summary for {today}")
        
        # Ambil semua jenis violation dari object_class sebagai baseline
        cursor.execute("""
            SELECT o.name
            FROM object_class o
            WHERE o.is_violation = TRUE
        """)
        all_violations = {row['name']: None for row in cursor.fetchall()}
        
        # Hitung data untuk hari ini
        cursor.execute("""
            SELECT o.name, COALESCE(SUM(vdl.total_violation), 0) as count
            FROM object_class o
            LEFT JOIN violation_daily_log vdl 
                ON vdl.id_violation = o.id 
                AND vdl.log_date = CURRENT_DATE
            WHERE o.is_violation = TRUE
            GROUP BY o.name;
        """)
        
        result = cursor.fetchall()
        
        # Gabungkan hasil (count) ke dalam template (all_violations)
        counted_map = {r['name']: str(r['count']) for r in result}
        
        summary = {name: counted_map.get(name, "-") for name in all_violations.keys()}
        
        # logging.info(f"Summary result: {summary}")
        return jsonify(summary)
    
    except Exception as e:
        logging.error(f"Error in summary_today: {str(e)}")
        return jsonify({"error": "Internal Server Error"}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@dashboard_bp.route('/dashboard/top_cctv_today')
def top_cctv_today():
    """
    Dashboard: menampilkan Top 5 CCTV berdasarkan total pelanggaran hari ini,
    lengkap dengan breakdown per jenis pelanggaran.
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        today = datetime.datetime.now().strftime('%Y-%m-%d')
        logging.info(f"Querying top CCTV for {today}")

        # 1. Ambil ID top 5 CCTV berdasarkan total pelanggaran hari ini
        cursor.execute("""
            SELECT cd.id
            FROM cctv_data cd
            JOIN violation_daily_log vdl ON vdl.id_cctv = cd.id
            WHERE vdl.log_date = CURRENT_DATE
            GROUP BY cd.id
            ORDER BY SUM(vdl.total_violation) DESC
            LIMIT 5
        """)
        top_cctv_rows = cursor.fetchall()

        # Pastikan hasil tidak kosong
        if not top_cctv_rows:
            logging.info("Tidak ada CCTV dengan pelanggaran hari ini.")
            return jsonify([])

        top_cctv_ids = [r["id"] for r in top_cctv_rows]
        # logging.info(f"Top CCTV IDs: {top_cctv_ids}")

        # 2. Ambil data detail setiap CCTV
        # Gunakan ANY() agar Postgres menerima array integer
        query = """
            SELECT 
                cd.id,
                cd.name,
                cd.location,
                oc.name AS violation_name,
                COALESCE(SUM(vdl.total_violation), 0) AS count_per_type
            FROM cctv_data cd
            CROSS JOIN object_class oc
            LEFT JOIN violation_daily_log vdl 
                ON vdl.id_cctv = cd.id 
                AND vdl.id_violation = oc.id
                AND vdl.log_date = CURRENT_DATE
            WHERE cd.id = ANY(%s)
              AND oc.is_violation = TRUE
            GROUP BY cd.id, cd.name, cd.location, oc.name
            ORDER BY cd.id, oc.name;
        """

        # 🔧 Eksekusi query dengan parameter array
        cursor.execute(query, (top_cctv_ids,))
        raw_results = cursor.fetchall()

        if not raw_results:
            logging.warning("Query returned no results.")
            return jsonify([])

        # 3. Transformasi hasil ke struktur JSON per CCTV
        final_result = {}
        for row in raw_results:
            cctv_id = row["id"]
            if cctv_id not in final_result:
                final_result[cctv_id] = {
                    "id": cctv_id,
                    "name": row["name"],
                    "location": row["location"],
                    "total": 0,
                    "breakdown": []
                }

            final_result[cctv_id]["breakdown"].append({
                "violation": row["violation_name"],
                "total": row["count_per_type"]
            })
            final_result[cctv_id]["total"] += row["count_per_type"]

        # 4. Urutkan berdasarkan total pelanggaran tertinggi
        sorted_result = sorted(final_result.values(), key=lambda x: x["total"], reverse=True)

        # logging.info(f"Top CCTV result: {sorted_result}")
        return jsonify(sorted_result)

    except Exception as e:
        logging.exception(f"Error in top_cctv_today: {e}")
        return jsonify({"error": "Internal Server Error"}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@dashboard_bp.route('/dashboard/weekly_trend')
def weekly_trend():
    """
    3. Menunjukkan total violation (SUM(total_violation)) selama 7 hari terakhir.
    Menggunakan TO_CHAR untuk memaksa format tanggal yang konsisten dengan frontend.
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        logging.info("Querying weekly trend for last 7 days")
        
        # Kueri untuk mendapatkan 7 hari terakhir dan total pelanggaran
        cursor.execute("""
            SELECT 
                -- Gunakan TO_CHAR untuk memastikan format string tanggal yang konsisten
                TO_CHAR(gs::date, 'Dy, DD Mon YYYY 00:00:00') AS date,
                COALESCE(SUM(vdl.total_violation), 0) AS value
            FROM generate_series(CURRENT_DATE - INTERVAL '6 day', CURRENT_DATE, '1 day') gs
            LEFT JOIN violation_daily_log vdl 
                ON vdl.log_date = gs::date
            GROUP BY gs
            ORDER BY gs;
        """)

        result = cursor.fetchall() or []
        
        # Mengubah value dari integer/float menjadi string (agar sama dengan format API sebelumnya)
        # Serta memastikan kunci 'date' memiliki timezone GMT di akhir string
        formatted_result = []
        for row in result:
            formatted_result.append({
                # Pastikan format GMT yang dibutuhkan frontend tetap ada
                'date': f"{row['date']} GMT", 
                'value': str(row['value'])
            })
            
        # logging.info(f"Weekly trend result: {formatted_result}")
        return jsonify(formatted_result)
        
    except Exception as e:
        # Menangani kesalahan kueri dengan lebih baik
        last_query = cursor.query.decode('utf-8') if cursor and hasattr(cursor, 'query') else 'N/A'
        logging.error(f"Weekly trend error: {str(e)} - Query: {last_query}")
        return jsonify({"error": str(e)}), 500
        
    finally:
        if cursor: cursor.close()
        if conn: conn.close()