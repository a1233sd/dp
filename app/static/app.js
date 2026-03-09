const output = document.getElementById("output");
const highlighted = document.getElementById("highlighted");
const docsBox = document.getElementById("docs");
const ownerSelect = document.getElementById("doc-owner-select");
const submissionSelect = document.getElementById("submission-select");
const uploadForm = document.getElementById("upload-form");
const manualForm = document.getElementById("doc-form");
const existingFields = document.getElementById("existing-check-fields");
const rawFields = document.getElementById("raw-check-fields");
const statusPill = document.getElementById("service-status");
const rulesBox = document.getElementById("rules");
const resultSummary = document.getElementById("result-summary");
const resultMatches = document.getElementById("result-matches");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const kindLabel = {
  reference: "Уникальный документ",
  submission: "Проверяемая работа",
  external: "Внешний источник",
};
const typeLabel = {
  text: "Текст",
  code: "Код",
};
const roleLabel = {
  student: "Студент",
  teacher: "Преподаватель",
};

function show(data) {
  if (typeof data === "string") {
    output.textContent = data;
    return;
  }
  if (data && typeof data === "object") {
    if ("id" in data && "originality_percent" in data) {
      output.textContent = `Проверка завершена. Оригинальность: ${data.originality_percent}%`;
      return;
    }
    if ("id" in data && "email" in data) {
      output.textContent = `Пользователь создан: ${data.full_name}`;
      return;
    }
    if ("id" in data && "kind" in data) {
      output.textContent = `Документ сохранен: ${data.title}`;
      return;
    }
    if ("status" in data) {
      output.textContent = `Статус: ${data.status}`;
      return;
    }
  }
  output.textContent = "Операция выполнена.";
}

function parseError(payload) {
  if (!payload) return "Неизвестная ошибка";
  if (typeof payload.detail === "string") return payload.detail;
  return JSON.stringify(payload);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  if (!response.ok) throw new Error(parseError(data));
  return data;
}

function clearFieldError(field) {
  if (!field) return;
  field.classList.remove("invalid");
  const next = field.nextElementSibling;
  if (next && next.classList.contains("field-error")) next.remove();
}

function setFieldError(field, message) {
  if (!field) return;
  clearFieldError(field);
  field.classList.add("invalid");
  const err = document.createElement("div");
  err.className = "field-error";
  err.textContent = message;
  field.insertAdjacentElement("afterend", err);
}

function clearFormErrors(form) {
  form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  form.querySelectorAll(".field-error").forEach((el) => el.remove());
}

function watchFieldValidation(form) {
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("input", () => clearFieldError(el));
    el.addEventListener("change", () => clearFieldError(el));
  });
}

function selectedDocMode() {
  const el = document.querySelector('input[name="doc_mode"]:checked');
  return el ? el.value : "pdf";
}

function selectedCheckMode() {
  const el = document.querySelector('input[name="check_mode"]:checked');
  return el ? el.value : "existing";
}

function updateDocModeUI() {
  const mode = selectedDocMode();
  uploadForm.classList.toggle("hidden", mode !== "pdf");
  manualForm.classList.toggle("hidden", mode !== "manual");
}

function updateCheckModeUI() {
  const mode = selectedCheckMode();
  existingFields.classList.toggle("hidden", mode !== "existing");
  rawFields.classList.toggle("hidden", mode !== "raw");
}

function validateUserForm(form) {
  clearFormErrors(form);
  let ok = true;
  const fullName = form.elements.full_name;
  const email = form.elements.email;
  const password = form.elements.password;

  if (!fullName.value.trim()) {
    setFieldError(fullName, "Введите ФИО.");
    ok = false;
  }
  if (!email.value.trim() || !emailPattern.test(email.value.trim())) {
    setFieldError(email, "Введите корректный email.");
    ok = false;
  }
  if (!password.value || password.value.length < 6) {
    setFieldError(password, "Пароль должен быть не менее 6 символов.");
    ok = false;
  }
  return ok;
}

function validateUploadForm(form) {
  clearFormErrors(form);
  const file = form.elements.file;
  let ok = true;
  if (!file.files || !file.files.length) {
    setFieldError(file, "Выберите PDF-файл.");
    ok = false;
  } else if (!file.files[0].name.toLowerCase().endsWith(".pdf")) {
    setFieldError(file, "Допустим только формат PDF.");
    ok = false;
  }
  return ok;
}

function validateManualForm(form) {
  clearFormErrors(form);
  const title = form.elements.title;
  const text = form.elements.text;
  let ok = true;
  if (!title.value.trim()) {
    setFieldError(title, "Укажите название документа.");
    ok = false;
  }
  if (!text.value.trim()) {
    setFieldError(text, "Добавьте содержимое документа.");
    ok = false;
  }
  return ok;
}

function validateRuleForm(form) {
  clearFormErrors(form);
  const name = form.elements.name;
  const pattern = form.elements.pattern;
  let ok = true;
  if (!name.value.trim()) {
    setFieldError(name, "Укажите название правила.");
    ok = false;
  }
  if (!pattern.value.trim()) {
    setFieldError(pattern, "Укажите regex-шаблон.");
    ok = false;
  } else {
    try {
      new RegExp(pattern.value);
    } catch (_) {
      setFieldError(pattern, "Некорректный regex-шаблон.");
      ok = false;
    }
  }
  return ok;
}

function validateCheckForm(form) {
  clearFormErrors(form);
  let ok = true;
  const mode = selectedCheckMode();
  if (mode === "existing") {
    const submission = form.elements.submission_document_id;
    if (!submission.value) {
      setFieldError(submission, "Выберите проверяемый документ.");
      ok = false;
    }
  } else {
    const text = form.elements.text;
    if (!text.value.trim()) {
      setFieldError(text, "Введите текст для проверки.");
      ok = false;
    }
  }

  const threshold = form.elements.uniqueness_threshold;
  const value = Number(threshold.value);
  if (Number.isNaN(value) || value < 0 || value > 100) {
    setFieldError(threshold, "Введите число от 0 до 100.");
    ok = false;
  }
  return ok;
}

function renderCheckResult(result) {
  if (!result || typeof result !== "object") {
    resultSummary.innerHTML = "";
    resultMatches.innerHTML = "";
    return;
  }
  resultSummary.innerHTML = `
    <div class="kpi"><span>Оригинальность</span><strong>${result.originality_percent}%</strong></div>
    <div class="kpi"><span>Совпавших токенов</span><strong>${result.matched_tokens}</strong></div>
    <div class="kpi"><span>Всего токенов</span><strong>${result.total_tokens}</strong></div>
    <div class="kpi"><span>Совпадений с источниками</span><strong>${(result.matches || []).length}</strong></div>
  `;

  const matches = result.matches || [];
  if (!matches.length) {
    resultMatches.innerHTML = '<p class="muted">Совпадений не найдено.</p>';
    return;
  }

  resultMatches.innerHTML = matches
    .slice(0, 10)
    .map((m) => {
      const fragmentBlock =
        m.source_kind === "reference" ? "" : `<div class="muted">Фрагмент: ${m.fragment}</div>`;
      return `<div class="match-item">
        <div><strong>${m.source_title}</strong> (${kindLabel[m.source_kind] || m.source_kind})</div>
        <div>Процент перекрытия: ${m.overlap_percent}%</div>
        ${fragmentBlock}
      </div>`;
    })
    .join("");
}

async function loadUsers() {
  const users = await api("/users");
  ownerSelect.innerHTML = '<option value="">Без владельца</option>';
  users.forEach((u) => {
    const option = document.createElement("option");
    option.value = u.id;
    option.textContent = `${u.full_name} (${roleLabel[u.role] || u.role})`;
    ownerSelect.appendChild(option);
  });
}

async function loadSubmissions() {
  const docs = await api("/documents?kind=submission");
  submissionSelect.innerHTML = '<option value="">Выберите документ</option>';
  docs.forEach((d) => {
    const option = document.createElement("option");
    option.value = d.id;
    option.textContent = `${d.title} [${typeLabel[d.content_type] || d.content_type}]`;
    submissionSelect.appendChild(option);
  });
}

async function loadDocuments() {
  docsBox.innerHTML = "Загрузка...";
  const docs = await api("/documents");
  if (!docs.length) {
    docsBox.textContent = "Документов пока нет.";
    return;
  }
  docsBox.innerHTML = docs
    .map(
      (d) => `<div class="doc-item">
        <div><strong>${d.title}</strong></div>
        <div>ID: ${d.id}</div>
        <div>Категория: ${kindLabel[d.kind] || d.kind}</div>
        <div>Тип: ${typeLabel[d.content_type] || d.content_type}</div>
        <div>В архиве уникальных: ${d.is_unique ? "да" : "нет"}</div>
      </div>`,
    )
    .join("");
}

async function loadRules() {
  const rules = await api("/rules/exclusions");
  if (!rules.length) {
    rulesBox.innerHTML = '<p class="muted">Правила не добавлены.</p>';
    return;
  }
  rulesBox.innerHTML = rules
    .map(
      (r) => `<div class="doc-item">
        <div><strong>${r.name}</strong></div>
        <div>Шаблон: <code>${r.pattern}</code></div>
        ${r.description ? `<div class="muted">${r.description}</div>` : ""}
        <button type="button" class="danger" data-del-rule="${r.id}">Удалить</button>
      </div>`,
    )
    .join("");
}

async function refreshAll() {
  try {
    await Promise.all([loadUsers(), loadSubmissions(), loadDocuments(), loadRules()]);
  } catch (err) {
    show(`Ошибка обновления данных: ${err.message}`);
  }
}

document.getElementById("btn-health").addEventListener("click", async () => {
  try {
    const health = await api("/health");
    statusPill.textContent = `Сервис: ${health.status}, документов ${health.documents_total}, пользователей ${health.users_total}`;
    show(health);
  } catch (err) {
    statusPill.textContent = "Сервис: недоступен";
    show(`Ошибка: ${err.message}`);
  }
});

document.getElementById("btn-sync").addEventListener("click", refreshAll);

document.querySelectorAll('input[name="doc_mode"]').forEach((el) => {
  el.addEventListener("change", updateDocModeUI);
});

document.querySelectorAll('input[name="check_mode"]').forEach((el) => {
  el.addEventListener("change", updateCheckModeUI);
});

document.getElementById("user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateUserForm(e.target)) {
    show("Проверьте поля формы пользователя.");
    return;
  }
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  try {
    const user = await api("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show(user);
    e.target.reset();
    await refreshAll();
    ownerSelect.value = user.id;
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateUploadForm(uploadForm)) {
    show("Проверьте форму загрузки PDF.");
    return;
  }
  const form = new FormData(uploadForm);
  if (!form.get("title")) form.delete("title");
  const owner = ownerSelect.value;
  if (owner) form.set("owner_user_id", owner);
  else form.delete("owner_user_id");
  try {
    const doc = await api("/documents/upload", { method: "POST", body: form });
    show(doc);
    await refreshAll();
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

manualForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateManualForm(manualForm)) {
    show("Проверьте поля формы документа.");
    return;
  }
  const form = new FormData(manualForm);
  const payload = Object.fromEntries(form.entries());
  const owner = ownerSelect.value;
  if (owner) payload.owner_user_id = owner;
  try {
    const doc = await api("/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show(doc);
    manualForm.reset();
    await refreshAll();
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

document.getElementById("rule-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateRuleForm(e.target)) {
    show("Проверьте поля формы правила исключения.");
    return;
  }
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  if (!payload.description) delete payload.description;
  try {
    const rule = await api("/rules/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show(rule);
    e.target.reset();
    await refreshAll();
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

rulesBox.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-del-rule]");
  if (!btn) return;
  const id = btn.getAttribute("data-del-rule");
  try {
    await api(`/rules/exclusions/${id}`, { method: "DELETE" });
    show(`Правило удалено: ${id}`);
    await refreshAll();
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

document.getElementById("check-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateCheckForm(e.target)) {
    show("Проверьте параметры проверки.");
    return;
  }

  const form = new FormData(e.target);
  const mode = selectedCheckMode();
  const payload = {
    include_external_sources: form.get("include_external_sources") === "on",
    include_unique_archive: form.get("include_unique_archive") === "on",
    use_exclusion_rules: form.get("use_exclusion_rules") === "on",
    uniqueness_threshold: Number(form.get("uniqueness_threshold") || 80),
  };

  if (mode === "existing") {
    payload.submission_document_id = form.get("submission_document_id");
  } else {
    payload.text = (form.get("text") || "").toString().trim();
    payload.content_type = form.get("content_type");
  }

  try {
    const result = await api("/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show(result);
    renderCheckResult(result);
    highlighted.innerHTML = result.highlighted_html || "";
    await refreshAll();
  } catch (err) {
    renderCheckResult(null);
    highlighted.innerHTML = "";
    show(`Ошибка: ${err.message}`);
  }
});

updateDocModeUI();
updateCheckModeUI();
watchFieldValidation(document.getElementById("user-form"));
watchFieldValidation(uploadForm);
watchFieldValidation(manualForm);
watchFieldValidation(document.getElementById("rule-form"));
watchFieldValidation(document.getElementById("check-form"));
refreshAll();
document.getElementById("btn-health").click();
