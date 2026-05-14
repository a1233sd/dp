from __future__ import annotations

import io
from pathlib import Path

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

from .plagiarism import page_marker

ALLOWED_EXTENSION = ".pdf"


async def extract_text_from_upload(upload: UploadFile) -> str:
    filename = upload.filename or ""
    ext = Path(filename).suffix.lower()
    if ext != ALLOWED_EXTENSION:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension '{ext}'. Only '.pdf' is supported.",
        )

    raw = await upload.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {exc}") from exc

    pages_text: list[str] = []
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages_text.append(f"{page_marker(page_number)}\n{page_text.strip()}")

    text = "\n".join(pages_text).strip()
    if not text:
        raise HTTPException(
            status_code=501,
            detail="Image-only PDFs are not supported yet (OCR is not implemented).",
        )
    return text
