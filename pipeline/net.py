"""HTTP helper with retries, polite pacing and an on-disk cache."""

import hashlib
import json
import os
import time
import urllib.error
import urllib.request

CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")

_last_call = {}


def _throttle(host, min_interval):
    now = time.time()
    wait = _last_call.get(host, 0) + min_interval - now
    if wait > 0:
        time.sleep(wait)
    _last_call[host] = time.time()


def get(url, headers=None, data=None, ttl_hours=12, min_interval=0.15, retries=4, timeout=30):
    """Return response bytes. Cached on disk for `ttl_hours` (0 disables)."""
    key = hashlib.sha1((url + (json.dumps(data, sort_keys=True) if data is not None else "")).encode()).hexdigest()
    path = os.path.join(CACHE_DIR, key)
    if ttl_hours and os.path.exists(path) and time.time() - os.path.getmtime(path) < ttl_hours * 3600:
        with open(path, "rb") as f:
            return f.read()

    host = url.split("/")[2]
    body = None
    hdrs = dict(headers or {})
    if data is not None:
        body = json.dumps(data).encode()
        hdrs.setdefault("Content-Type", "application/json")

    delay = 2.0
    for attempt in range(retries):
        _throttle(host, min_interval)
        try:
            req = urllib.request.Request(url, data=body, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
            if ttl_hours:
                os.makedirs(CACHE_DIR, exist_ok=True)
                with open(path, "wb") as f:
                    f.write(raw)
            return raw
        except urllib.error.HTTPError as e:
            # 404s are permanent; 429/5xx are worth retrying.
            if e.code in (400, 401, 403, 404) or attempt == retries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries - 1:
                raise
        time.sleep(delay)
        delay *= 2
    raise RuntimeError("unreachable")


def get_json(url, **kw):
    return json.loads(get(url, **kw).decode("utf-8"))
