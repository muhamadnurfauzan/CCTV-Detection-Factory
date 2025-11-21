# app.py (KODE YANG BENAR)
import logging
import sys
import os

current_dir = os.path.abspath(os.path.dirname(__file__)) 
sys.path.insert(0, os.path.abspath(os.path.join(current_dir, '..')))
sys.path.insert(0, current_dir)

from flask import Flask
from flask_cors import CORS
from threading import Thread

# Impor ini sekarang akan bekerja karena sys.path sudah disesuaikan
import config
from core import detection
import utils.helpers as helpers
import scheduler  
from core import detection
from services import config_service
from services import cctv_services

# Import Blueprints dari routes
import routes.cctv_crud as cctv_crud
import routes.user_crud as user_crud
import routes.dashboard_routes as dashboard_routes
import routes.reporting_routes as reporting_routes
import routes.misc_routes as misc_routes
import routes.object_routes as object_routes

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")  

# --- REGISTRASI BLUEPRINT ---
app.register_blueprint(cctv_crud.cctv_bp)
app.register_blueprint(user_crud.user_bp)
app.register_blueprint(dashboard_routes.dashboard_bp)
app.register_blueprint(reporting_routes.reports_bp)
app.register_blueprint(misc_routes.misc_bp)
app.register_blueprint(object_routes.object_bp)

if __name__ == "__main__":
    helpers.reset_table_sequence('violation_detection')
    helpers.reset_table_sequence('cctv_data')

    # Inisialisasi cache sebelum deteksi dimulai
    cctv_services.refresh_all_cctv_configs()
    config_service.refresh_active_violations()
    config_service.load_email_config()
    config_service.load_object_classes()
    config_service.load_violation_pairs() 

    # Jalankan deteksi multi-CCTV 
    threads = detection.start_all_detections()
    # Log di sini sudah termasuk thread scheduler
    logging.info(f"Started {len(threads)} core/scheduler threads for CCTV management.")

    # Jalankan scheduler
    Thread(target=scheduler.scheduler_thread, daemon=True).start()
    logging.info("DB/Global Scheduler thread started.")

    app.run(host="0.0.0.0", port=5000, threaded=True, debug=False)