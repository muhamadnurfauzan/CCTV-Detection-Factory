# backend/utils/resource_monitor.py
import psutil
import time
import logging

_last_log = 0
_INTERVAL = 15

def log_resource(label: str = "ALL"):
    global _last_log
    now = time.time()
    if now - _last_log < _INTERVAL:
        return
    _last_log = now

    try:
        process = psutil.Process()
        cpu = process.cpu_percent(interval=None)
        mem_mb = process.memory_info().rss / 1024 / 1024
        mem_pct = process.memory_percent()
        threads = process.num_threads()
        sys_cpu = psutil.cpu_percent(interval=None)

        logging.info(
            f"[MONITOR] {label:>8} | "
            f"CPU {cpu:5.1f}% (sys {sys_cpu:5.1f}%) | "
            f"RAM {mem_mb:6.0f} MB ({mem_pct:5.1f}%) | "
            f"Threads {threads}"
        )
    except Exception:
        pass  