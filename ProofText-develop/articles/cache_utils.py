# articles/cache_utils.py
import json
import os
import threading
from time import time

CACHE_FILE = "google_search_cache.json"
CACHE_LOCK = threading.Lock()
CACHE_EXPIRATION = 60 * 60 * 24  # 24 часа


def load_cache():
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_cache(cache_data):
    with CACHE_LOCK:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)


def get_cached_result(query):
    cache = load_cache()
    record = cache.get(query)
    if record:
        timestamp = record.get("timestamp", 0)
        if time() - timestamp < CACHE_EXPIRATION:
            return record.get("results")
    return None


def set_cached_result(query, results):
    cache = load_cache()
    cache[query] = {"timestamp": time(), "results": results}
    save_cache(cache)
