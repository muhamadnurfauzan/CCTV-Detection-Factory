# pm2_manager.py
import sys
import os
import shutil

# Mendapatkan path absolut dari direktori 'backend'
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)

if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Sekarang baru bisa melakukan import
import subprocess
import json
import time
import logging
from services.cctv_services import get_all_active_cctv
from core.cctv_scheduler import get_active_cctv_ids_now

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")

def get_pm2_cmd():
    """Mencari perintah PM2 yang tepat sesuai OS."""
    # Mencari pm2.cmd (Windows) atau pm2 (Linux/Mac) di dalam PATH
    cmd = shutil.which("pm2")
    if not cmd:
        # Fallback manual jika shutil.which gagal di beberapa env Windows
        cmd = "pm2.cmd" if os.name == 'nt' else "pm2"
    return cmd

def get_running_pm2_processes():
    pm2_executable = get_pm2_cmd()
    # Menambahkan --json agar output konsisten
    result = subprocess.run([pm2_executable, 'jlist'], capture_output=True, text=True)
    try:
        processes = json.loads(result.stdout)
        return processes
    except:
        return []

def sync_cctv_workers():
    logging.info("[SYNC] Checking database and schedules...")
    pm2_executable = get_pm2_cmd()
    
    # Ambil ID yang AKTIF secara jadwal dan ENABLED di DB
    active_ids_by_schedule = get_active_cctv_ids_now()
    all_cctvs = get_all_active_cctv()
    
    # Filter: Hanya yang enabled DAN masuk jadwal aktif
    final_active_cctvs = [c for c in all_cctvs if c['id'] in active_ids_by_schedule]
    final_active_ids = [c['id'] for c in final_active_cctvs]
    
    running_processes = get_running_pm2_processes()
    running_id_map = {}
    
    for p in running_processes:
        # PM2 jlist terkadang mengembalikan proses yang berstatus 'stopped' atau 'errored'
        # Kita hanya fokus pada argumen --cctv_id
        args = p.get('pm2_env', {}).get('args', [])
        if '--cctv_id' in args:
            idx = args.index('--cctv_id')
            try:
                c_id = int(args[idx + 1])
                running_id_map[c_id] = p['name']
            except (ValueError, IndexError):
                continue

    # 1. START atau UPDATE worker (Gunakan list object, bukan list ID)
    for cctv in final_active_cctvs: 
        c_id = cctv['id']
        c_name = "".join(x for x in cctv['name'] if x.isalnum() or x == '-').replace(" ", "-")
        desired_process_name = f"CCTV-{c_id}_{c_name}"
        
        if c_id not in running_id_map:
            logging.info(f"[START] Launching: {desired_process_name}")
            subprocess.run([
                pm2_executable, 'start', 'workers/worker_cctv.py',
                '--name', desired_process_name,
                '--exp-backoff-restart-delay', '100',
                '--max-restarts', '50',
                '--kill-timeout', '3000',
                '--', '--cctv_id', str(c_id)
            ])
        elif running_id_map[c_id] != desired_process_name:
            logging.info(f"[RENAME/UPDATE] {running_id_map[c_id]} -> {desired_process_name}")
            subprocess.run([pm2_executable, 'delete', running_id_map[c_id]])
            subprocess.run([
                pm2_executable, 'start', 'workers/worker_cctv.py',
                '--name', desired_process_name,
                '--exp-backoff-restart-delay', '100',
                '--max-restarts', '50',
                '--kill-timeout', '3000',
                '--', '--cctv_id', str(c_id)
            ])

    # 2. STOP & DELETE jika sudah tidak dijadwalkan atau disabled
    for r_id, r_name in running_id_map.items():
        if r_id not in final_active_ids:
            logging.info(f"[STOP] Deleting worker: {r_name} (out of schedule or disabled)")
            subprocess.run([pm2_executable, 'delete', r_name])

if __name__ == "__main__":
    # Saat pertama kali manager jalan, sebaiknya bersihkan worker lama yang nyangkut
    logging.info("PM2 Orchestrator Started.")
    while True:
        try:
            sync_cctv_workers()
        except Exception as e:
            logging.error(f"Sync Error: {e}")
        time.sleep(15)