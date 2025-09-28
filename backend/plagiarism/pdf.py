from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader


class PdfExtractionError(Exception):
    pass


def extract_text_from_pdf(raw_bytes: bytes) -> str:
    try:
        buffer = BytesIO(raw_bytes)
        reader = PdfReader(buffer)
    except Exception as exc:  # pragma: no cover - defensive guard
        raise PdfExtractionError('Не удалось прочитать PDF файл') from exc

    try:
        text_chunks = [page.extract_text() or '' for page in reader.pages]
    except Exception as exc:  # pragma: no cover - defensive guard
        raise PdfExtractionError('Не удалось извлечь текст из PDF файла') from exc

    text = '\n'.join(chunk for chunk in text_chunks if chunk)
    if not text.strip():
        raise PdfExtractionError('PDF файл не содержит текста')
    return text
