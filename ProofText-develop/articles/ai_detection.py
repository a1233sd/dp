# articles/ai_detection.py
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# Загружаем модель один раз при старте
MODEL_NAME = "roberta-base"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)


def detect_ai(text: str) -> float:
    """
    Использует RoBERTa для определения вероятности AI-генерации текста.
    Возвращает число от 0 до 100.
    """
    inputs = tokenizer(text, return_tensors="pt",
                       truncation=True, max_length=512)

    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probs = torch.softmax(logits, dim=1).squeeze().tolist()

    # probs[1] — вероятность того, что это AI-текст
    ai_probability = probs[1]
    return round(ai_probability * 100, 2)
