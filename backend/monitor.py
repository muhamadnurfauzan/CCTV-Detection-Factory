# backend/monitor.py
import time
import psutil
import logging
from utils.resource_monitor import log_resource

# Format log sama persis dengan yang lain
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

if __name__ == "__main__":
    logging.info("[MONITOR] Standalone resource monitor started")
    logging.info("[MONITOR] Will log every 15 seconds — can be stopped/restarted independently")

    while True:
        try:
            # Log seluruh proses Python (backend + semua CCTV)
            log_resource("SYSTEM")
        except Exception as e:
            logging.error(f"[MONITOR] Error: {e}")
        time.sleep(15)