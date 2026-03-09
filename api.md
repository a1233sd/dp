# API Documentation

Документ описывает текущее API сервиса антиплагиата из `app/main.py`.
Базовый URL по умолчанию: `http://127.0.0.1:8000`
Swagger: `http://127.0.0.1:8000/docs`

## 1. Общая логика работы сервиса

Сервис реализует локальную проверку учебных работ на заимствования с поддержкой:
- документов-эталонов (`reference`);
- проверяемых работ (`submission`);
- внешних источников, добавленных вручную (`external`);
- правил исключений (regex);
- архива уникальных работ (индексы ранее проверенных и признанных уникальными документов).

Ключевой поток:
1. Добавляются пользователи (опционально).
2. Добавляются документы (`reference`/`submission`) и внешние источники.
3. При добавлении документа строится индекс (shingles + hash).
4. Запускается проверка `/checks`.
5. Возвращается процент оригинальности, совпадения, подсветка `<mark>` и отчет.
6. `submission` может быть помещён в архив уникальных работ при достижении порога.

## 2. Модель данных (в API-терминах)

- `User`: `id`, `full_name`, `email`, `role`, `created_at`
- `Document`: `id`, `title`, `kind`, `content_type`, `owner_user_id`, `source_url`, `is_unique`, `created_at`
- `ExclusionRule`: `id`, `name`, `pattern`, `description`, `created_at`
- `Check`: `id`, `submission_document_id`, `originality_percent`, `matched_tokens`, `total_tokens`, `processed_text`, `highlighted_html`, `checked_at`, `matches[]`
- `Match`: `source_document_id`, `source_title`, `source_kind`, `source_url`, `overlap_percent`, `fragment`, `start_char`, `end_char`

## 3. System API

### GET `/health`
Назначение:
- Проверка состояния сервиса и базовых метрик.

Что делает:
1. Считывает документы.
2. Считывает архив уникальных.
3. Считывает пользователей.
4. Возвращает агрегат.

Ответ `200`:
```json
{
  "status": "ok",
  "documents_total": 12,
  "unique_archive_total": 3,
  "users_total": 5
}
```

## 4. Users API

### POST `/users`
Назначение:
- Создать пользователя (student/teacher).

Тело запроса:
```json
{
  "full_name": "Ivan Ivanov",
  "email": "ivan@example.com",
  "role": "student",
  "password": "secret123"
}
```

Проверки:
- `email` должен содержать `@`;
- уникальность email обеспечивается БД.

Ответ `200`:
```json
{
  "id": "uuid",
  "full_name": "Ivan Ivanov",
  "email": "ivan@example.com",
  "role": "student",
  "created_at": "2026-03-09T12:00:00+00:00"
}
```

Ошибки:
- `400`: невалидный email или ошибка вставки (например, дубликат email).

### GET `/users`
Назначение:
- Получить список пользователей.

Ответ `200`:
- массив объектов `UserOut`, сортировка по `created_at DESC`.

## 5. Documents API

### POST `/documents`
Назначение:
- Создать документ из текста.

Тело запроса:
```json
{
  "title": "Lab report #1",
  "text": "Some text...",
  "kind": "reference",
  "content_type": "text",
  "owner_user_id": "optional-user-uuid"
}
```

Логика:
1. Проверяется существование `owner_user_id` (если передан).
2. Документ сохраняется в БД.
3. Текст токенизируется.
4. Строится shingle-индекс и сохраняется в `document_indexes`.

Ответ `200`:
- `DocumentOut`.

Ошибки:
- `404`: владелец не найден.
- `400`: пустой/некорректный текст или ошибка БД.

### POST `/documents/upload`
Назначение:
- Загрузить документ из файла.

Формат:
- `multipart/form-data`
- поля: `file`, `title?`, `kind?`, `content_type?`, `owner_user_id?`

Ограничения:
- Принимается только `.pdf`.

Логика:
1. Проверка пользователя (если передан).
2. Проверка расширения файла (только PDF).
3. Извлечение текста из PDF (`pypdf`).
4. Если PDF image-only: текст пустой, файл всё равно сохраняется.
5. Сохранение документа и индекса.

Ответ `200`:
- `DocumentOut`.

Ошибки:
- `400`: не PDF, пустой файл, повреждённый PDF.
- `404`: владелец не найден.

### GET `/documents`
Назначение:
- Список документов.

Query параметры:
- `kind`: `reference | submission | external`
- `content_type`: `text | code`
- `only_unique`: `true | false`

Логика фильтра:
- комбинированные фильтры по переданным параметрам.

Ответ `200`:
- массив `DocumentOut`.

### GET `/documents/{document_id}`
Назначение:
- Получить документ по ID.

Ответы:
- `200`: `DocumentOut`
- `404`: документ не найден

## 6. External Sources API

### POST `/external-sources`
Назначение:
- Добавить внешний источник в локальное хранилище для сравнения.

Тело запроса:
```json
{
  "title": "Article fragment",
  "url": "https://example.com/article",
  "text": "Source text ...",
  "content_type": "text"
}
```

Логика:
1. Создаёт `Document` с `kind=external`.
2. Строит индекс.
3. Используется в `/checks`, если `include_external_sources=true`.

Ответ `200`:
- `DocumentOut`.

## 7. Unique Archive API

### GET `/archive/unique`
Назначение:
- Получить архив уникальных работ (документы + данные индекса).

Ответ `200`:
```json
[
  {
    "id": "uuid",
    "title": "submission-1",
    "content_type": "text",
    "created_at": "...",
    "owner_user_id": "uuid",
    "shingle_size": 3,
    "token_count": 120,
    "updated_at": "..."
  }
]
```

## 8. Rules API

### POST `/rules/exclusions`
Назначение:
- Добавить regex-правило исключения.

Тело запроса:
```json
{
  "name": "remove-introduction",
  "pattern": "Введение",
  "description": "Не учитывать типовой заголовок"
}
```

Логика:
1. Проверка валидности regex через `re.compile`.
2. Сохранение в БД.

Ответ `200`:
- `ExclusionRuleOut`.

Ошибки:
- `400`: невалидный regex.

### GET `/rules/exclusions`
Назначение:
- Получить список правил исключений.

Ответ `200`:
- массив `ExclusionRuleOut`.

### DELETE `/rules/exclusions/{rule_id}`
Назначение:
- Удалить правило по ID.

Ответы:
- `200`: `{"status":"deleted"}`
- `404`: правило не найдено

## 9. Checks API

### POST `/checks`
Назначение:
- Запустить проверку на заимствования.

Тело запроса (вариант 1: по документу):
```json
{
  "submission_document_id": "uuid",
  "reference_ids": ["uuid1", "uuid2"],
  "include_external_sources": true,
  "include_unique_archive": true,
  "use_exclusion_rules": true,
  "uniqueness_threshold": 80.0
}
```

Тело запроса (вариант 2: по raw text):
```json
{
  "text": "Some submission text",
  "content_type": "text",
  "include_external_sources": true,
  "include_unique_archive": true,
  "use_exclusion_rules": true
}
```

Обязательные условия:
- Нужно передать `submission_document_id` или `text`.
- Если используется `text`, обязательно `content_type`.

Как работает алгоритм:
1. Определяет исходный текст (`submission_document_id` или raw text).
2. Применяет правила исключений (если включено).
3. Токенизирует текст.
4. Формирует shingles и hash-наборы.
5. Собирает набор источников:
   - `reference`;
   - `external` (если включено);
   - `is_unique=true` (если включён архив уникальных).
6. Для каждого источника ищет общие shingle-хэши.
7. Фиксирует совпадающие позиции токенов, выделяет интервалы, считает overlap.
8. Считает:
   - `total_tokens`,
   - `matched_tokens`,
   - `originality_percent = (1 - matched/total) * 100`.
9. Строит `highlighted_html`.
10. Сохраняет check и matches.
11. Если проверялся `submission_document_id` и порог выполнен, документ помечается `is_unique=true`.

Ответ `200` (`CheckOut`):
```json
{
  "id": "uuid",
  "submission_document_id": "uuid",
  "originality_percent": 82.14,
  "matched_tokens": 25,
  "total_tokens": 140,
  "processed_text": "....",
  "highlighted_html": "<pre>....<mark>...</mark>....</pre>",
  "checked_at": "...",
  "matches": [
    {
      "source_document_id": "uuid",
      "source_title": "ref-1",
      "source_kind": "reference",
      "source_url": null,
      "overlap_percent": 21.5,
      "fragment": "...",
      "start_char": 120,
      "end_char": 210
    }
  ]
}
```

Ошибки:
- `404`: submission не найден.
- `400`: нет токенов для анализа; нет источников сравнения; нет `content_type` для raw text.

### GET `/checks/{check_id}`
Назначение:
- Получить сохранённый результат проверки.

Ответы:
- `200`: `CheckOut`
- `404`: проверка не найдена

### GET `/checks/{check_id}/report`
Назначение:
- Получить структурированный отчёт по проверке.

Что возвращает:
- `check`: полный `CheckOut`;
- `summary`: агрегаты по проверке;
- `by_source_kind`: сколько совпадений по типам источников.

Пример ответа:
```json
{
  "check": { "...": "..." },
  "summary": {
    "originality_percent": 82.14,
    "matched_sources": 3,
    "matched_tokens": 25,
    "total_tokens": 140
  },
  "by_source_kind": {
    "reference": 2,
    "external": 1
  }
}
```

## 10. Важные поведенческие детали

1. Если PDF scanned/image-only и текст не извлечен:
- документ загружается;
- при проверке может не дать токенов и фактически не участвовать в сравнении.

2. Индексы документа обновляются:
- при создании документа;
- при проверке submission.

3. Внешние источники не ищутся в интернете автоматически:
- их нужно добавлять вручную через `/external-sources`.

4. API не использует JWT/сессии:
- пользовательские записи есть, но контроль доступа не включён.

