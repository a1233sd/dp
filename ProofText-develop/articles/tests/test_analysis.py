# articles/tests/test_analysis.py
from unittest.mock import patch

from articles import cache_utils
from articles.ai_detection import detect_ai
from articles.external_search import search_google_fragment


def test_cache_set_and_get(tmp_path, monkeypatch):
    test_query = "sample fragment"
    test_results = [{"title": "Test",
                     "url": "http://example.com", "snippet": "text"}]

    cache_file = tmp_path / "test_cache.json"
    monkeypatch.setattr(cache_utils, "CACHE_FILE", str(cache_file))

    cache_utils.set_cached_result(test_query, test_results)
    cached = cache_utils.get_cached_result(test_query)

    assert cached == test_results


@patch("articles.external_search.get_cached_result")
@patch("articles.external_search.set_cached_result")
@patch("articles.external_search.requests.get")
def test_search_google_fragment_uses_api(mock_get,
                                         mock_set_cache,
                                         mock_get_cache):
    mock_get_cache.return_value = None

    mock_response = {
        "items": [
            {"title": "Test Result",
             "link": "http://example.com", "snippet": "snippet"}
        ]
    }

    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = mock_response

    result = search_google_fragment("unit test example")

    assert isinstance(result, list)
    assert result[0]["title"] == "Test Result"
    assert mock_set_cache.called


def test_detect_ai_probability_range():
    result = detect_ai("This is an example "
                       "academic abstract about psychology.")
    assert 0 <= result <= 100
