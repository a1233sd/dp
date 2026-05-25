import asyncio
import io
import zipfile
from urllib.parse import parse_qs, urlsplit
from xml.sax.saxutils import escape

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from pypdf import PdfWriter

from app import main as api
from app.plagiarism import page_marker
from app.storage import list_rules, reset_db


class DirectResponse:
    def __init__(self, status_code: int, payload: object) -> None:
        self.status_code = status_code
        self._payload = jsonable_encoder(payload)

    def json(self) -> object:
        return self._payload


class UploadStub:
    def __init__(self, filename: str, content: bytes) -> None:
        self.filename = filename
        self._content = content

    async def read(self) -> bytes:
        return self._content


class DirectClient:
    def _call(self, func, *args, **kwargs) -> DirectResponse:
        try:
            payload = func(*args, **kwargs)
            return DirectResponse(200, payload)
        except HTTPException as exc:
            return DirectResponse(exc.status_code, {"detail": exc.detail})

    async def _call_async(self, func, *args, **kwargs) -> DirectResponse:
        try:
            payload = await func(*args, **kwargs)
            return DirectResponse(200, payload)
        except HTTPException as exc:
            return DirectResponse(exc.status_code, {"detail": exc.detail})

    @staticmethod
    def _authorization(headers: dict | None) -> str | None:
        return (headers or {}).get("Authorization")

    @staticmethod
    def _upload_from_tuple(file_tuple: tuple) -> UploadStub:
        filename = file_tuple[0]
        content = file_tuple[1]
        if hasattr(content, "read"):
            content = content.read()
        return UploadStub(filename=filename, content=content)

    def get(self, path: str, headers: dict | None = None) -> DirectResponse:
        parts = urlsplit(path)
        query = parse_qs(parts.query)
        route = parts.path
        authorization = self._authorization(headers)

        if route == "/health":
            return self._call(api.health)
        if route == "/settings":
            return self._call(api.get_settings)
        if route == "/openapi.json":
            return DirectResponse(200, api.app.openapi())
        if route == "/users":
            return self._call(api.get_users)
        if route == "/profiles":
            return self._call(api.get_profiles, authorization=authorization)
        if route == "/rules/exclusions":
            profile_id = query.get("profile_id", [None])[0]
            return self._call(api.get_exclusion_rules, profile_id=profile_id, authorization=authorization)
        if route == "/documents":
            kind = query.get("kind", [None])[0]
            only_unique_raw = query.get("only_unique", [None])[0]
            only_unique = None if only_unique_raw is None else only_unique_raw.lower() == "true"
            return self._call(api.get_documents, kind=kind, only_unique=only_unique)
        if route == "/archive/unique":
            return self._call(api.get_unique_archive)
        if route.startswith("/documents/") and route.endswith("/text"):
            return self._call(api.get_document_text, route.split("/")[2])
        if route.startswith("/documents/"):
            return self._call(api.get_document_by_id, route.rsplit("/", 1)[1])
        if route.endswith("/report") and route.startswith("/checks/"):
            return self._call(api.get_check_report, route.split("/")[2])
        if route.startswith("/checks/"):
            return self._call(api.get_check_result, route.rsplit("/", 1)[1])
        if route == "/me":
            return self._call(api.get_me, authorization=authorization)
        raise AssertionError(f"Unhandled GET {path}")

    def post(
        self,
        path: str,
        json: dict | None = None,
        files: dict | list | None = None,
        data: dict | None = None,
        headers: dict | None = None,
    ) -> DirectResponse:
        authorization = self._authorization(headers)
        if path == "/users":
            return self._call(api.create_user, api.UserCreate(**(json or {})))
        if path == "/auth/register":
            return self._call(api.register, api.UserCreate(**(json or {})))
        if path == "/auth/login":
            return self._call(api.login, api.UserLogin(**(json or {})))
        if path == "/profiles":
            return self._call(
                api.create_profile,
                api.UserProfileCreate(**(json or {})),
                authorization=authorization,
            )
        if path == "/documents":
            return self._call(api.create_document, api.DocumentCreate(**(json or {})))
        if path == "/documents/upload":
            upload = self._upload_from_tuple(files["file"])
            return asyncio.run(
                self._call_async(
                    api.upload_document,
                    file=upload,
                    title=(data or {}).get("title"),
                    kind=(data or {}).get("kind", "submission"),
                    owner_user_id=(data or {}).get("owner_user_id"),
                )
            )
        if path == "/documents/upload/batch":
            upload_files = [
                self._upload_from_tuple(file_tuple)
                for field_name, file_tuple in (files or [])
                if field_name == "files"
            ]
            return asyncio.run(
                self._call_async(
                    api.upload_documents_batch,
                    files=upload_files,
                    kind=(data or {}).get("kind", "submission"),
                    owner_user_id=(data or {}).get("owner_user_id"),
                )
            )
        if path == "/rules/exclusions":
            return self._call(
                api.create_exclusion_rule,
                api.ExclusionRuleCreate(**(json or {})),
                authorization=authorization,
            )
        if path == "/checks":
            return self._call(api.run_check, api.CheckRequest(**(json or {})), authorization=authorization)
        if path.startswith("/documents/") and path.endswith("/archive"):
            return self._call(api.add_document_to_unique_archive, path.split("/")[2])
        raise AssertionError(f"Unhandled POST {path}")

    def patch(
        self,
        path: str,
        json: dict | None = None,
        headers: dict | None = None,
    ) -> DirectResponse:
        authorization = self._authorization(headers)
        if path.startswith("/profiles/"):
            return self._call(
                api.patch_profile,
                path.rsplit("/", 1)[1],
                api.UserProfileUpdate(**(json or {})),
                authorization=authorization,
            )
        if path.startswith("/checks/") and path.endswith("/originality"):
            return self._call(
                api.patch_check_originality,
                path.split("/")[2],
                api.CheckOriginalityUpdate(**(json or {})),
            )
        if path.startswith("/documents/"):
            return self._call(api.patch_document, path.rsplit("/", 1)[1], api.DocumentUpdate(**(json or {})))
        raise AssertionError(f"Unhandled PATCH {path}")

    def delete(self, path: str, headers: dict | None = None) -> DirectResponse:
        authorization = self._authorization(headers)
        if path.startswith("/profiles/"):
            return self._call(api.remove_profile, path.rsplit("/", 1)[1], authorization=authorization)
        if path.startswith("/rules/exclusions/"):
            return self._call(api.remove_exclusion_rule, path.rsplit("/", 1)[1], authorization=authorization)
        if path.startswith("/documents/"):
            return self._call(api.delete_document, path.rsplit("/", 1)[1])
        raise AssertionError(f"Unhandled DELETE {path}")


client = DirectClient()


def setup_function() -> None:
    reset_db()


def make_docx_bytes(paragraphs: list[str]) -> bytes:
    body = "".join(
        f"<w:p><w:r><w:t>{escape(paragraph)}</w:t></w:r></w:p>"
        for paragraph in paragraphs
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body>"
        "</w:document>"
    )
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("word/document.xml", document)
    return stream.getvalue()


def make_docx_bytes_with_page_break(
    first_page: str = "First page alpha beta gamma",
    second_page: str = "Second page delta epsilon zeta",
) -> bytes:
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        f"<w:p><w:r><w:t>{escape(first_page)}</w:t></w:r></w:p>"
        f'<w:p><w:r><w:br w:type="page"/><w:t>{escape(second_page)}</w:t></w:r></w:p>'
        "</w:body>"
        "</w:document>"
    )
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("word/document.xml", document)
    return stream.getvalue()


def upload_docx_document(filename: str, raw: bytes, kind: str) -> DirectResponse:
    return client.post(
        "/documents/upload",
        files={
            "file": (
                filename,
                raw,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"kind": kind},
    )


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


def test_document_text_endpoint_returns_full_text() -> None:
    document = client.post(
        "/documents",
        json={
            "title": "source-with-text",
            "text": "Full source text for detailed report comparison.",
            "kind": "reference",
        },
    )
    payload = document.json()

    response = client.get(f"/documents/{payload['id']}/text")

    assert response.status_code == 200
    assert response.json()["title"] == "source-with-text"
    assert response.json()["text"] == "Full source text for detailed report comparison."


def test_matches_are_split_into_precise_fragments() -> None:
    ref = client.post(
        "/documents",
        json={
            "title": "split-reference",
            "text": "alpha beta gamma source-only middle words delta epsilon zeta",
            "kind": "reference",
        },
    )
    submission = client.post(
        "/documents",
        json={
            "title": "split-submission",
            "text": "alpha beta gamma original bridge should stay outside delta epsilon zeta",
            "kind": "submission",
        },
    )

    check = client.post(
        "/checks",
        json={
            "submission_document_id": submission.json()["id"],
            "reference_ids": [ref.json()["id"]],
            "include_unique_archive": False,
            "use_exclusion_rules": False,
        },
    )

    assert check.status_code == 200
    fragments = [match["fragment"] for match in check.json()["matches"]]
    assert len(fragments) == 2
    assert any(fragment == "alpha beta gamma" for fragment in fragments)
    assert any(fragment == "delta epsilon zeta" for fragment in fragments)
    assert all("original bridge" not in fragment for fragment in fragments)


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


def test_page_exclusion_does_not_empty_single_page_document() -> None:
    text = f"{page_marker(1)}\nSingle page copied phrase alpha beta gamma."
    ref = client.post(
        "/documents",
        json={"title": "reference-single-page", "text": text, "kind": "reference"},
    )
    submission = client.post(
        "/documents",
        json={"title": "submission-single-page", "text": text, "kind": "submission"},
    )
    rule = client.post(
        "/rules/exclusions",
        json={"name": "page one", "rule_type": "pages", "value": "1"},
    )
    assert rule.status_code == 200

    check = client.post(
        "/checks",
        json={
            "submission_document_id": submission.json()["id"],
            "reference_ids": [ref.json()["id"]],
            "include_unique_archive": False,
            "use_exclusion_rules": True,
        },
    )

    assert check.status_code == 200
    assert check.json()["total_tokens"] > 0


def test_text_exclusion_rule_types_apply_to_docx_uploads() -> None:
    cases = [
        (
            "literal",
            "literal shared phrase alpha beta gamma",
            "literal shared phrase alpha beta gamma",
        ),
        (
            "contains",
            "contains shared phrase",
            "contains shared phrase alpha beta gamma",
        ),
        (
            "starts_with",
            "REMOVE-LINE",
            "REMOVE-LINE starts shared phrase alpha beta gamma",
        ),
        (
            "regex",
            r"REGEX-\d{3}\s+shared phrase alpha beta gamma",
            "REGEX-123 shared phrase alpha beta gamma",
        ),
    ]

    for rule_type, rule_value, shared_paragraph in cases:
        reset_db()
        ref = upload_docx_document(
            f"{rule_type}-ref.docx",
            make_docx_bytes(
                [
                    shared_paragraph,
                    "Reference only words one two three",
                ]
            ),
            "reference",
        )
        submission = upload_docx_document(
            f"{rule_type}-submission.docx",
            make_docx_bytes(
                [
                    shared_paragraph,
                    "Submission only words four five six",
                ]
            ),
            "submission",
        )
        assert ref.status_code == 200
        assert submission.status_code == 200

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
        assert base.json()["matches"], rule_type

        rule = client.post(
            "/rules/exclusions",
            json={"name": f"{rule_type} docx rule", "rule_type": rule_type, "value": rule_value},
        )
        assert rule.status_code == 200

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
        assert reduced.json()["matches"] == [], rule_type
        assert "shared phrase alpha beta gamma" not in reduced.json()["processed_text"]


def test_page_exclusion_rule_applies_to_docx_with_page_breaks() -> None:
    shared_page = "Shared title page copied phrase alpha beta gamma"
    ref = upload_docx_document(
        "paged-ref.docx",
        make_docx_bytes_with_page_break(
            shared_page,
            "Reference page body unique one two three",
        ),
        "reference",
    )
    submission = upload_docx_document(
        "paged-submission.docx",
        make_docx_bytes_with_page_break(
            shared_page,
            "Submission page body unique four five six",
        ),
        "submission",
    )
    assert ref.status_code == 200
    assert submission.status_code == 200

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
        json={"name": "docx title page", "rule_type": "pages", "value": "1"},
    )
    assert rule.status_code == 200

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
    assert shared_page not in reduced.json()["processed_text"]
    assert "Submission page body" in reduced.json()["processed_text"]


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
    schema = api.app.openapi()
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


def test_docx_upload_extracts_text() -> None:
    response = client.post(
        "/documents/upload",
        files={
            "file": (
                "work.docx",
                make_docx_bytes(["Docx unique alpha beta gamma", "Second paragraph"]),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"kind": "submission"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "work.docx"
    document = client.get(f"/documents/{payload['id']}")
    assert document.status_code == 200


def test_docx_without_page_breaks_is_not_marked_as_single_page() -> None:
    response = client.post(
        "/documents/upload",
        files={
            "file": (
                "work.docx",
                make_docx_bytes(["Docx unique alpha beta gamma", "Second paragraph"]),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"kind": "submission"},
    )

    assert response.status_code == 200
    document = client.get(f"/documents/{response.json()['id']}/text")
    assert document.status_code == 200
    assert page_marker(1) not in document.json()["text"]


def test_docx_with_explicit_page_breaks_preserves_page_markers() -> None:
    response = client.post(
        "/documents/upload",
        files={
            "file": (
                "paged.docx",
                make_docx_bytes_with_page_break(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"kind": "submission"},
    )

    assert response.status_code == 200
    document = client.get(f"/documents/{response.json()['id']}/text")
    assert document.status_code == 200
    assert page_marker(1) in document.json()["text"]
    assert page_marker(2) in document.json()["text"]


def test_auth_profiles_scope_rules_for_checks() -> None:
    auth = client.post(
        "/auth/register",
        json={
            "full_name": "Scoped User",
            "email": "scoped@example.com",
            "role": "student",
            "password": "secret123",
        },
    )
    assert auth.status_code == 200
    auth_payload = auth.json()
    headers = {"Authorization": f"Bearer {auth_payload['token']}"}
    profile_id = auth_payload["active_profile_id"]

    profile = client.post("/profiles", json={"name": "Diploma"}, headers=headers)
    assert profile.status_code == 200
    profile_id = profile.json()["id"]

    rule = client.post(
        "/rules/exclusions",
        json={
            "name": "remove copied intro",
            "rule_type": "contains",
            "value": "copied intro phrase",
            "profile_id": profile_id,
        },
        headers=headers,
    )
    assert rule.status_code == 200
    assert rule.json()["owner_user_id"] == auth_payload["user"]["id"]
    assert rule.json()["profile_id"] == profile_id

    ref = client.post(
        "/documents",
        json={
            "title": "scoped-ref",
            "text": "copied intro phrase unique source tail",
            "kind": "reference",
        },
    )
    assert ref.status_code == 200

    without_auth = client.post(
        "/checks",
        json={
            "text": "copied intro phrase unique source tail",
            "reference_ids": [ref.json()["id"]],
            "include_unique_archive": False,
            "use_exclusion_rules": True,
        },
    )
    assert without_auth.status_code == 200
    assert without_auth.json()["matches"]

    with_profile = client.post(
        "/checks",
        json={
            "text": "copied intro phrase unique source tail",
            "reference_ids": [ref.json()["id"]],
            "include_unique_archive": False,
            "use_exclusion_rules": True,
            "profile_id": profile_id,
        },
        headers=headers,
    )
    assert with_profile.status_code == 400
    assert "Text has no tokens" in with_profile.json()["detail"]


def test_profile_can_be_renamed_and_deleted() -> None:
    auth = client.post(
        "/auth/register",
        json={
            "full_name": "Profile User",
            "email": "profile@example.com",
            "role": "teacher",
            "password": "secret123",
        },
    )
    assert auth.status_code == 200
    auth_payload = auth.json()
    headers = {"Authorization": f"Bearer {auth_payload['token']}"}

    created = client.post("/profiles", json={"name": "Draft rules"}, headers=headers)
    assert created.status_code == 200
    profile_id = created.json()["id"]

    renamed = client.patch(
        f"/profiles/{profile_id}",
        json={"name": "Diploma rules"},
        headers=headers,
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Diploma rules"

    rule = client.post(
        "/rules/exclusions",
        json={
            "name": "profile-only rule",
            "rule_type": "literal",
            "value": "temporary text",
            "profile_id": profile_id,
        },
        headers=headers,
    )
    assert rule.status_code == 200
    assert client.get(f"/rules/exclusions?profile_id={profile_id}", headers=headers).json()

    deleted = client.delete(f"/profiles/{profile_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["profile_id"] == profile_id

    profiles = client.get("/profiles", headers=headers)
    assert profiles.status_code == 200
    assert all(profile["id"] != profile_id for profile in profiles.json())
    assert list_rules(
        owner_user_id=auth_payload["user"]["id"],
        profile_id=profile_id,
        include_global=False,
    ) == []
    missing_profile_rules = client.get(f"/rules/exclusions?profile_id={profile_id}", headers=headers)
    assert missing_profile_rules.status_code == 404

    last_profile_id = profiles.json()[0]["id"]
    last_delete = client.delete(f"/profiles/{last_profile_id}", headers=headers)
    assert last_delete.status_code == 400
    assert "last profile" in last_delete.json()["detail"]


def test_batch_upload_handles_more_than_100_unique_files_and_check() -> None:
    files = []
    for index in range(105):
        text = (
            f"unique-file-{index} alpha-{index} beta-{index} gamma-{index} "
            f"delta-{index} epsilon-{index}"
        ).encode("utf-8")
        files.append(("files", (f"unique-{index}.txt", text, "text/plain")))

    batch = client.post(
        "/documents/upload/batch",
        files=files,
        data={"kind": "reference"},
    )
    assert batch.status_code == 200
    payload = batch.json()
    assert payload["total"] == 105
    assert payload["saved"] == 105
    assert payload["failed"] == 0
    assert len(client.get("/archive/unique").json()) == 105

    submission = client.post(
        "/documents",
        json={
            "title": "new-unique-submission",
            "text": "brand new submission tokens one two three four five six",
            "kind": "submission",
        },
    )
    assert submission.status_code == 200

    check = client.post(
        "/checks",
        json={
            "submission_document_id": submission.json()["id"],
            "include_unique_archive": True,
            "use_exclusion_rules": False,
        },
    )
    assert check.status_code == 200
    assert check.json()["originality_percent"] == 100.0
