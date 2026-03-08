import logging
from functools import wraps

from .cache_utils import get_cached_result, set_cached_result

logger = logging.getLogger(__name__)  # добавили это


def cached_search(func):
    @wraps(func)
    def wrapper(query, *args, **kwargs):
        cached = get_cached_result(query)
        if cached is not None:
            logger.info("[Cached] Используется кэш для запроса.")
            return cached
        result = func(query, *args, **kwargs)
        set_cached_result(query, result)
        return result

    return wrapper
