# articles/use_cases.py
import io
import os

import fitz
from django.conf import settings
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .ai_detection import detect_ai
from .external_search import search_google_fragment


def extract_text_from_pdf(pdf_file):
    text = ""
    try:
        pdf_file.seek(0)
        with fitz.open(stream=pdf_file.read(), filetype="pdf") as doc:
            for page in doc:
                text += page.get_text()
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(f"[PDF ERROR] {e}")
    return text.strip()


def analyze_text_fragments(text):
    words = text.split()
    fragment_size = 25
    step = 20
    fragments = [
        " ".join(words[i: i + fragment_size])
        for i in range(0, len(words), step)
        if len(words[i: i + fragment_size]) >= 10
    ]

    plagiarism_hits = 0
    total_checked = 0
    detailed_matches = []

    for frag in fragments:
        try:
            results = search_google_fragment(frag)
            best_match = None
            best_score = 0.0

            for res in results:
                try:
                    vectorizer = (TfidfVectorizer().
                                  fit_transform([frag, res["snippet"]]))
                    cos_sim = cosine_similarity(vectorizer[0:1],
                                                vectorizer[1:2])[0][0]
                    sim_percent = round(cos_sim * 100, 2)
                except Exception:
                    sim_percent = 0.0

                if sim_percent > best_score:
                    best_score = sim_percent
                    best_match = {
                        "fragment": frag,
                        "similarity_percent": sim_percent,
                        "url": res["url"],
                        "title": res["title"],
                        "snippet": res["snippet"],
                    }

            if best_score >= 60.0 and best_match:
                plagiarism_hits += 1
                detailed_matches.append(best_match)

            total_checked += 1
        except Exception:
            continue

    originality_percent = (
        100.0
        if total_checked == 0
        else max(0.0, 100.0 - (plagiarism_hits / total_checked) * 100.0)
    )
    return originality_percent, detailed_matches


def analyze_report_logic(report):
    text = report.content.strip()
    originality_percent, detailed_matches = analyze_text_fragments(text)

    try:
        ai_score = detect_ai(text)
        ai_score = float(ai_score) if ai_score is not None else 0.0
    except Exception:
        ai_score = 0.0

    report.originality_percent = round(originality_percent, 2)
    report.ai_generated_percent = round(ai_score, 2)
    report.save()

    return originality_percent, ai_score, detailed_matches


def prepare_pdf_certificate(report):
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer)

    font_path = os.path.join(settings.BASE_DIR, "static", "DejaVuSans.ttf")
    pdfmetrics.registerFont(TTFont("DejaVu", font_path))
    p.setFont("DejaVu", 14)

    p.drawString(100, 800, "Справка по докладу")
    p.drawString(100, 760, f"Название: {report.title}")
    p.drawString(100, 740, f"Автор: "
                           f"{report.author.full_name}"
                           f" ({report.author.email})")
    p.drawString(100, 720, f"Дата: "
                           f"{report.created_at.strftime('%d.%m.%Y %H:%M')}")

    originality = (
        report.originality_percent
        if report.originality_percent is not None else "–"
    )
    ai_generated = (
        report.ai_generated_percent
        if report.ai_generated_percent is not None else "–"
    )

    p.drawString(100, 700, f"Оригинальность: {originality}%")
    p.drawString(100, 680, f"ИИ-генерация: {ai_generated}%")

    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer
