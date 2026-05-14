import io

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.main import app
from app.plagiarism import page_marker
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


def test_page_exclusion_rules_remove_selected_pages() -> None:
    ref_text = (
        f"{page_marker(1)}\n"
        "Copied title sheet common phrase for page exclusion.\n"
        f"{page_marker(2)}\n"
        "Reference body alpha beta gamma delta."
    )
    submission_text = (
        f"{page_marker(1)}\n"
        "Copied title sheet common phrase for page exclusion.\n"
        f"{page_marker(2)}\n"
        "Submission body epsilon zeta eta theta."
    )
    ref = client.post(
        "/documents",
        json={"title": "reference-with-pages", "text": ref_text, "kind": "reference"},
    )
    submission = client.post(
        "/documents",
        json={"title": "submission-with-pages", "text": submission_text, "kind": "submission"},
    )

    base = client.post(
        "/checks",
        json={
            "submission_document_id": submission.json()["id"],
            "reference_ids": [ref.json()["id"]],
            "include_unique_archive": False,
            "use_exclusion_rules": False,
        },
    )
    assert base.status_code == 200
    assert base.json()["matches"]

    rule = client.post(
        "/rules/exclusions",
        json={"name": "title page", "rule_type": "pages", "value": "1"},
    )
    assert rule.status_code == 200
    assert rule.json()["pattern"] == "1"

    reduced = client.post(
        "/checks",
        json={
            "submission_document_id": submission.json()["id"],
            "reference_ids": [ref.json()["id"]],
            "include_unique_archive": False,
            "use_exclusion_rules": True,
        },
    )
    assert reduced.status_code == 200
    assert reduced.json()["matches"] == []


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
    assert check.status_code == 400

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


def test_settings_endpoint_exposes_default_threshold() -> None:
    response = client.get("/settings")
    assert response.status_code == 200
    payload = response.json()
    assert "default_uniqueness_threshold" in payload
    assert 0 <= payload["default_uniqueness_threshold"] <= 100


def test_system_endpoints_are_hidden_from_openapi() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/health" not in paths
    assert "/settings" not in paths


def test_openapi_request_body_required_fields() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]

    assert set(components["UserCreate"]["required"]) == {"full_name", "email", "role", "password"}
    assert set(components["DocumentCreate"]["required"]) == {"title", "text"}
    assert components["DocumentUpdate"].get("required") is None
    assert set(components["ExclusionRuleCreate"]["required"]) == {"name"}
    assert components["CheckRequest"].get("required") is None
    assert set(components["CheckOriginalityUpdate"]["required"]) == {"originality_percent"}

    upload_schema = components["Body_upload_document_documents_upload_post"]
    assert set(upload_schema["required"]) == {"file"}
    assert "owner_user_id" not in upload_schema["required"]
    assert "title" not in upload_schema["required"]
    assert "kind" not in upload_schema["required"]


def test_upload_image_only_pdf_returns_not_implemented() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    stream = io.BytesIO()
    writer.write(stream)
    stream.seek(0)

    response = client.post(
        "/documents/upload",
        files={"file": ("scan.pdf", stream.getvalue(), "application/pdf")},
        data={"kind": "submission"},
    )
    assert response.status_code == 501
    assert "OCR is not implemented" in response.json()["detail"]
