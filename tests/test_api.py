from fastapi.testclient import TestClient

from app.main import app, checks, documents, exclusion_rules


client = TestClient(app)


def setup_function() -> None:
    documents.clear()
    checks.clear()
    exclusion_rules.clear()


def test_health() -> None:
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_text_check_with_match_and_highlight() -> None:
    reference = client.post(
        '/documents',
        json={
            'title': 'ref-text',
            'text': 'Это тестовый документ с оригинальным содержанием и важной фразой для анализа.',
            'kind': 'reference',
            'content_type': 'text',
        },
    )
    assert reference.status_code == 200
    ref_id = reference.json()['id']

    response = client.post(
        '/checks',
        json={
            'text': 'В моей работе есть важной фразой для анализа и немного нового текста.',
            'content_type': 'text',
            'reference_ids': [ref_id],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['originality_percent'] < 100
    assert payload['matches']
    assert '<mark>' in payload['highlighted_html']


def test_code_check_with_match() -> None:
    reference = client.post(
        '/documents',
        json={
            'title': 'ref-code',
            'text': 'def add(a, b):\n    result = a + b\n    return result',
            'kind': 'reference',
            'content_type': 'code',
        },
    )
    ref_id = reference.json()['id']

    response = client.post(
        '/checks',
        json={
            'text': 'def add(x, y):\n    result = x + y\n    return result',
            'content_type': 'code',
            'reference_ids': [ref_id],
        },
    )
    assert response.status_code == 200
    assert response.json()['matches']


def test_exclusion_rule_reduces_matches() -> None:
    ref = client.post(
        '/documents',
        json={
            'title': 'r1',
            'text': 'Введение Курсовая работа выполнена студентом Ивановым.',
            'kind': 'reference',
            'content_type': 'text',
        },
    )
    ref_id = ref.json()['id']

    base = client.post(
        '/checks',
        json={
            'text': 'Введение Курсовая работа выполнена студентом Петровым.',
            'content_type': 'text',
            'reference_ids': [ref_id],
            'use_exclusion_rules': False,
        },
    )
    assert base.status_code == 200
    base_matches = len(base.json()['matches'])

    rule = client.post(
        '/rules/exclusions',
        json={
            'name': 'remove-intro',
            'pattern': r'Введение',
            'description': 'Исключить стандартный заголовок',
        },
    )
    assert rule.status_code == 200

    reduced = client.post(
        '/checks',
        json={
            'text': 'Введение Курсовая работа выполнена студентом Петровым.',
            'content_type': 'text',
            'reference_ids': [ref_id],
            'use_exclusion_rules': True,
        },
    )
    assert reduced.status_code == 200
    assert len(reduced.json()['matches']) <= base_matches


def test_check_without_references_returns_400() -> None:
    response = client.post('/checks', json={'text': 'Просто текст без базы сравнения'})
    assert response.status_code == 400
