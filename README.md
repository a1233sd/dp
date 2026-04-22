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
- Схема БД управляется миграциями `Alembic` (применяются автоматически при старте).
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
- Alembic
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
- Если `DATABASE_URL` не задан и локальный PostgreSQL недоступен, приложение автоматически переключается на `sqlite:///./antiplagiarism.sqlite3`.
- Можно сразу запустить проект на SQLite: `DATABASE_URL=sqlite:///./antiplagiarism.sqlite3`
- Можно отключить автоинициализацию на старте: `AUTO_INIT_DB=0`.
- Таймаут подключения к БД (секунды): `DB_CONNECT_TIMEOUT_SECONDS=5`.
- Значение порога для `POST /checks` по умолчанию:
  - `DEFAULT_UNIQUENESS_THRESHOLD=80` (диапазон `0..100`).

Swagger UI:
- `http://127.0.0.1:8000/docs`
Demo UI:
- `http://127.0.0.1:8000/`

## Минимальная проверка через Swagger

Если вам нужно только добавить эталонные документы и проверить одну работу, достаточно трех шагов в Swagger UI (`/docs`).

1. Добавьте один или несколько эталонных документов через `POST /documents`.
   Для каждого эталона указывайте `kind=reference`.

```json
{
  "title": "Эталон 1",
  "text": "Текст уникального документа, с которым нужно сравнивать работы.",
  "kind": "reference"
}
```

2. Добавьте проверяемый документ через `POST /documents` или `POST /documents/upload`.
   Если добавляете текстом, укажите `kind=submission` и сохраните `id` из ответа.

```json
{
  "title": "Работа студента",
  "text": "Текст документа, который нужно проверить.",
  "kind": "submission"
}
```

3. Запустите проверку через `POST /checks`.
   В `submission_document_id` передайте `id` проверяемого документа.
   В `reference_ids` можно передать список только тех эталонов, которые вы добавили вручную.
   Если хотите сравнение только с выбранными эталонами, поставьте `include_unique_archive=false`.

```json
{
  "submission_document_id": "ID_ПРОВЕРЯЕМОГО_ДОКУМЕНТА",
  "reference_ids": [
    "ID_ЭТАЛОНА_1",
    "ID_ЭТАЛОНА_2"
  ],
  "include_unique_archive": false,
  "use_exclusion_rules": true,
  "uniqueness_threshold": 80
}
```

Результат проверки возвращается сразу в ответе `POST /checks`.
Если потом захотите открыть его повторно, используйте:
- `GET /checks/{check_id}` — полный результат проверки.
- `GET /checks/{check_id}/report` — краткий структурированный отчет.

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
- `POST /users` — создать пользователя.
- `GET /users` — получить список пользователей.

### Документы
- `POST /documents` — добавить документ из текста
- `POST /documents/upload` — загрузить PDF-документ (`multipart/form-data`).
- `GET /documents` — получить список документов.
- `GET /documents/{document_id}` — получить документ по ID.
- `PATCH /documents/{document_id}` — обновить документ.
- `DELETE /documents/{document_id}` — удалить документ.

### Архив уникальных работ
- `GET /archive/unique` — получить архив уникальных работ.
- `POST /documents/{document_id}/archive` — вручную добавить документ в архив уникальных работ.

### Правила исключений
- `POST /rules/exclusions` — создать правило исключения.
- `GET /rules/exclusions` — получить список правил исключения.
- `DELETE /rules/exclusions/{rule_id}` — удалить правило исключения.

### Проверка и отчеты
- `POST /checks` — запустить проверку документа на заимствования.
- `GET /checks/{check_id}` — получить сохраненный результат проверки.
- `PATCH /checks/{check_id}/originality` — вручную изменить процент оригинальности.
- `GET /checks/{check_id}/report` — получить структурированный отчет по проверке.

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
- Для image-only PDF (сканы без текстового слоя) API возвращает `501 Not Implemented`:
  - OCR пока не реализован.
