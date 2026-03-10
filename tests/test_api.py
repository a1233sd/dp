from fastapi.testclient import TestClient

from app.main import app
from app.storage import reset_db


client = TestClient(app)


def setup_function() -> None:
    reset_db()


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_user_document_check_and_report() -> None:
    user = client.post(
        "/users",
        json={
            "full_name": "Ivan Ivanov",
            "email": "ivan@example.com",
            "role": "student",
            "password": "secret123",
        },
    )
    assert user.status_code == 200
    user_id = user.json()["id"]

    ref = client.post(
        "/documents",
        json={
            "title": "reference-text",
            "text": "This educational report contains a key phrase for analysis.",
            "kind": "reference",
            "owner_user_id": user_id,
        },
    )
    assert ref.status_code == 200
    ref_id = ref.json()["id"]

    submission = client.post(
        "/documents",
        json={
            "title": "submission-text",
            "text": "My work contains a key phrase for analysis and extra original words.",
            "kind": "submission",
            "owner_user_id": user_id,
        },
    )
    assert submission.status_code == 200
    submission_id = submission.json()["id"]

    check = client.post(
        "/checks",
        json={
            "submission_document_id": submission_id,
            "reference_ids": [ref_id],
            "include_unique_archive": False,
        },
    )
    assert check.status_code == 200
    payload = check.json()
    assert payload["originality_percent"] < 100
    assert payload["matches"]
    assert "<mark>" in payload["highlighted_html"]

    report = client.get(f"/checks/{payload['id']}/report")
    assert report.status_code == 200
    assert report.json()["summary"]["matched_sources"] >= 1


def test_exclusion_rules_reduce_matches() -> None:
    ref = client.post(
        "/documents",
        json={
            "title": "r1",
            "text": "Introduction standard phrase copied by student",
            "kind": "reference",
        },
    )
    ref_id = ref.json()["id"]

    base = client.post(
        "/checks",
        json={
            "text": "Introduction standard phrase copied by student with unique tail",
            "reference_ids": [ref_id],
            "include_unique_archive": False,
            "use_exclusion_rules": False,
        },
    )
    assert base.status_code == 200
    base_matches = len(base.json()["matches"])

    rule = client.post(
        "/rules/exclusions",
        json={"name": "remove_intro", "rule_type": "literal", "value": "Introduction"},
    )
    assert rule.status_code == 200

    reduced = client.post(
        "/checks",
        json={
            "text": "Introduction standard phrase copied by student with unique tail",
            "reference_ids": [ref_id],
            "include_unique_archive": False,
            "use_exclusion_rules": True,
        },
    )
    assert reduced.status_code == 200
    assert len(reduced.json()["matches"]) <= base_matches


def test_unique_archive_population() -> None:
    client.post(
        "/documents",
        json={
            "title": "standalone-submission",
            "text": "completely original standalone text token one two three four five six",
            "kind": "submission",
        },
    )
    submission_id = client.get("/documents?kind=submission").json()[0]["id"]

    check = client.post(
        "/checks",
        json={
            "submission_document_id": submission_id,
            "include_unique_archive": False,
            "uniqueness_threshold": 90.0,
        },
    )
    assert check.status_code == 400  # no sources

    # Add a tiny reference that should not impact uniqueness much.
    client.post(
        "/documents",
        json={
            "title": "small-reference",
            "text": "alpha beta gamma",
            "kind": "reference",
        },
    )
    check = client.post(
        "/checks",
        json={
            "submission_document_id": submission_id,
            "include_unique_archive": False,
            "uniqueness_threshold": 90.0,
        },
    )
    assert check.status_code == 200

    archive = client.get("/archive/unique")
    assert archive.status_code == 200
    assert any(item["id"] == submission_id for item in archive.json())
