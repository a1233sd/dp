# articles/external_search.py
import logging

import requests
from django.conf import settings

from .decorators import cached_search

logger = logging.getLogger(__name__)


@cached_search
def search_google_fragment(query):
    """
    Выполняет Google Custom Search и возвращает результаты.
    """
    api_key = settings.GOOGLE_API_KEY
    cse_id = settings.GOOGLE_CSE_ID

    if not api_key or not cse_id:
        logger.warning("GOOGLE_API_KEY или"
                       " GOOGLE_CSE_ID не заданы в settings.")
        return []

    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": api_key,
        "cx": cse_id,
        "q": query,
        "num": 5,
    }

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
    except requests.HTTPError as e:
        if response.status_code == 429:
            logger.warning("Превышен лимит запросов (429).")
        else:
            logger.error(f"HTTP Error: {e}")
        return []
    except requests.RequestException as e:
        logger.error(f"Request Exception: {e}")
        return []

    results = [
        {
            "title": item.get("title"),
            "url": item.get("link"),
            "snippet": item.get("snippet"),
        }
        for item in data.get("items", [])
    ]

    logger.info(f"[Google Search] Найдено совпадений: {len(results)}")
    return results
