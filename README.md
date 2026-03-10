# AntiPlagiarism Educational API

Локальный backend (FastAPI + Swagger) для проверки учебных работ на заимствования по концепции из НИР:
- загрузка и хранение документов,
- сравнение с архивом эталонов и архивом ранее проверенных уникальных работ,
- правила исключений,
- расчет процента оригинальности,
- визуальное выделение совпадений,
- структурированный отчет по проверке.

## Реализовано

- Локальная БД `PostgreSQL` с персистентным хранением:
  - пользователей,
  - индексов документов (shingle hashes),
  - проверок и совпадений,
  - правил исключений.
- Индексация документов и повторное использование индексов при проверке.
- Архив уникальных работ:
  - после проверки `submission` документ помечается как уникальный, если `originality_percent >= uniqueness_threshold`.
- Визуализация совпадений через `highlighted_html` с тегом `<mark>`.
- Swagger API: `/docs`.

## Стек

- Python 3.10+
- FastAPI
- Uvicorn
- Pydantic
- PostgreSQL
- psycopg (binary)
- Pytest

## Установка и запуск

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Переменная подключения к БД:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/antiplagiarism`
- При старте приложение автоматически создаёт БД из `DATABASE_URL`, если она отсутствует.

Swagger UI:
- `http://127.0.0.1:8000/docs`
Demo UI:
- `http://127.0.0.1:8000/`

## Основные сущности

- `User` (student/teacher)
- `Document`:
  - `reference` — эталонный документ,
  - `submission` — проверяемая работа,
- `DocumentIndex` — индекс shingle-хэшей документа.
- `Check` — результат проверки.
- `CheckMatch` — совпадение с конкретным источником.
- `ExclusionRule` — regex-правило исключения фрагментов.

## API

### Система
- `GET /health`

### Пользователи
- `POST /users`
- `GET /users`

### Документы
- `POST /documents` — добавить документ из текста
- `POST /documents/upload` — загрузить только PDF (`multipart/form-data`)
- `GET /documents` — список документов
- `GET /documents/{document_id}`

### Архив уникальных работ
- `GET /archive/unique`

### Правила исключений
- `POST /rules/exclusions`
- `GET /rules/exclusions`
- `DELETE /rules/exclusions/{rule_id}`

### Проверка и отчеты
- `POST /checks`
- `GET /checks/{check_id}`
- `GET /checks/{check_id}/report`

## Базовый сценарий

1. Создать пользователя (`POST /users`).
2. Добавить эталоны (`POST /documents`, `kind=reference`).
3. Добавить работу студента (`POST /documents`, `kind=submission`) или передать текст напрямую в `POST /checks`.
4. Запустить проверку (`POST /checks`):
   - выбрать источники (`reference_ids`) или использовать все,
   - включить/выключить архив уникальных работ,
   - применить/не применять правила исключений.
5. Получить результат (`GET /checks/{id}`) и структурированный отчет (`GET /checks/{id}/report`).
6. Проверить накопление архива уникальных работ (`GET /archive/unique`).

## Ограничения

- `POST /documents/upload` принимает только `.pdf`.
- Для image-only PDF (сканы без текстового слоя) текст не извлекается; такие файлы сохраняются и пропускаются при сравнении.
