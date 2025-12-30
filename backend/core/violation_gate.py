import time
from config import CLEANUP_INTERVAL

class ViolationGate:
    def __init__(self, ttl=CLEANUP_INTERVAL):
        """
        ttl = berapa detik violation dianggap 'masih berlangsung'
        """
        self.ttl = ttl
        self.active = {}  # key -> last_seen_time

    def _cleanup(self, now):
        expired = [
            k for k, t in self.active.items()
            if now - t > self.ttl
        ]
        for k in expired:
            del self.active[k]

    def should_report(self, key):
        """
        Return True jika violation ini BARU
        """
        now = time.time()
        self._cleanup(now)

        if key in self.active:
            return False

        # violation baru
        self.active[key] = now
        return True
