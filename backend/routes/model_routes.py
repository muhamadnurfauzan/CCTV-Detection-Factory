import os
from flask import Blueprint, jsonify, request
from db.db_config import get_connection
from utils.auth import require_role
from shared_state import state
from services.cctv_services import update_model_activation_in_db

model_bp = Blueprint('model', __name__, url_prefix='/api/model')

# Path folder model
MODEL_DIR = os.path.join(os.getcwd(), "model")

@model_bp.route('/list', methods=['GET'])
@require_role(['super_admin'])
def list_available_models():
    """
    Mengambil daftar model dari database ai_models dan 
    mencocokkannya dengan ketersediaan file di server.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # Ambil semua data dari tabel ai_models
        cur.execute("SELECT id, filename, display_name, is_active FROM ai_models ORDER BY id ASC")
        rows = cur.fetchall()
        
        models_data = []
        for row in rows:
            m_id, filename, display_name, is_active = row
            file_path = os.path.join(MODEL_DIR, filename)
            
            # Cek apakah file fisiknya benar-benar ada di folder
            exists = os.path.exists(file_path)
            size_mb = round(os.path.getsize(file_path) / (1024 * 1024), 2) if exists else 0
            
            models_data.append({
                "id": m_id,
                "filename": filename,
                "display_name": display_name,
                "is_active": is_active,
                "exists_on_server": exists,
                "size_mb": size_mb
            })
            
        return jsonify({"models": models_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

@model_bp.route('/activate', methods=['POST'])
@require_role(['super_admin'])
def activate_model():
    data = request.json
    model_id = data.get('id')
    
    # Panggil service untuk urusan database
    target_filename = update_model_activation_in_db(model_id)
    
    if not target_filename:
        return jsonify({"error": "Model tidak ditemukan atau gagal diupdate"}), 404
        
    # Update Shared State (Gunakan MODEL_LOCK seperti rencana sebelumnya)
    with state.MODEL_LOCK:
        state.active_model_filename = target_filename
    
    return jsonify({"success": True, "message": f"Model {target_filename} aktif"})