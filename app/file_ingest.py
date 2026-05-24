from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

from .plagiarism import page_marker


def extract_text_from_pdf_bytes(raw: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {exc}") from exc

    pages_text: list[str] = []
    for page_number, page in enumerate(reader.pages, start=1):
        if "/Contents" not in page:
            continue
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


def decode_text_bytes(raw: bytes) -> str | None:
    if b"\x00" in raw[:4096]:
        return None
    for encoding in ("utf-8-sig", "utf-8", "cp1251", "latin-1"):
        try:
            text = raw.decode(encoding)
        except UnicodeDecodeError:
            continue
        if text.strip():
            return text.strip()
    return None


def docx_text_from_bytes(raw: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            document_xml = archive.read("word/document.xml")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid DOCX file: {exc}") from exc

    try:
        root = ElementTree.fromstring(document_xml)
    except ElementTree.ParseError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid DOCX XML: {exc}") from exc

    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs: list[str] = []
    for paragraph in root.iter(f"{ns}p"):
        parts: list[str] = []
        for node in paragraph.iter():
            if node.tag == f"{ns}t" and node.text:
                parts.append(node.text)
            elif node.tag == f"{ns}tab":
                parts.append("\t")
            elif node.tag == f"{ns}br":
                parts.append("\n")
        text = "".join(parts).strip()
        if text:
            paragraphs.append(text)

    text = "\n".join(paragraphs).strip()
    if not text:
        raise HTTPException(status_code=400, detail="DOCX file has no extractable text.")
    return f"{page_marker(1)}\n{text}"


def pptx_text_from_bytes(raw: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            slide_names = sorted(
                name
                for name in archive.namelist()
                if name.startswith("ppt/slides/slide") and name.endswith(".xml")
            )
            slides = [archive.read(name) for name in slide_names]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid PPTX file: {exc}") from exc

    ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    pages_text: list[str] = []
    for slide_number, slide_xml in enumerate(slides, start=1):
        try:
            root = ElementTree.fromstring(slide_xml)
        except ElementTree.ParseError:
            continue
        text = "\n".join(
            node.text.strip()
            for node in root.iter(f"{ns}t")
            if node.text and node.text.strip()
        ).strip()
        if text:
            pages_text.append(f"{page_marker(slide_number)}\n{text}")

    text = "\n".join(pages_text).strip()
    if not text:
        raise HTTPException(status_code=400, detail="PPTX file has no extractable text.")
    return text


def convert_to_pdf_text_with_libreoffice(raw: bytes, suffix: str) -> str | None:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        input_path = tmp_path / f"upload{suffix or '.bin'}"
        input_path.write_bytes(raw)
        command = [
            soffice,
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(tmp_path),
            str(input_path),
        ]
        try:
            subprocess.run(
                command,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=60,
            )
        except Exception:
            return None

        pdf_path = input_path.with_suffix(".pdf")
        if not pdf_path.exists():
            return None
        return extract_text_from_pdf_bytes(pdf_path.read_bytes())


async def extract_text_from_upload(upload: UploadFile) -> str:
    filename = upload.filename or ""
    ext = Path(filename).suffix.lower()
    raw = await upload.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if ext == ".pdf":
        return extract_text_from_pdf_bytes(raw)

    if ext == ".docx":
        return docx_text_from_bytes(raw)
    if ext == ".pptx":
        return pptx_text_from_bytes(raw)

    text = decode_text_bytes(raw)
    if text:
        return f"{page_marker(1)}\n{text}"

    converted_text = convert_to_pdf_text_with_libreoffice(raw, ext)
    if converted_text:
        return converted_text

    supported = ".pdf, .docx, .pptx and text-like files"
    raise HTTPException(
        status_code=415,
        detail=(
            f"Could not extract text from '{filename or 'uploaded file'}'. "
            f"Supported without external converters: {supported}. "
            "Install LibreOffice for broader office-file conversion to PDF."
        ),
    )
