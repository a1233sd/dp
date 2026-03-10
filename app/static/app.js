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
const btnEditOriginality = document.getElementById("btn-edit-originality");
const btnAddArchive = document.getElementById("btn-add-archive");

const btnOpenResultModal = document.getElementById("btn-open-result-modal");
const resultModal = document.getElementById("result-modal");
const btnCloseResultModal = document.getElementById("btn-close-result-modal");
const modalResultSummary = document.getElementById("modal-result-summary");
const modalResultMatches = document.getElementById("modal-result-matches");
const modalHighlighted = document.getElementById("modal-highlighted");

const docModal = document.getElementById("doc-modal");
const btnCloseDocModal = document.getElementById("btn-close-doc-modal");
const docEditForm = document.getElementById("doc-edit-form");
const btnDeleteDocument = document.getElementById("btn-delete-document");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const kindLabel = {
  reference: "Уникальный документ",
  submission: "Проверяемая работа",
};
const roleLabel = { student: "Студент", teacher: "Преподаватель" };
const ruleTypeLabel = {
  literal: "Точная фраза",
  contains: "Строка содержит",
  starts_with: "Строка начинается с",
  regex: "Расширенный (regex)",
};

let currentResult = null;
let currentCheckId = null;
let currentSubmissionDocumentId = null;
let editingDocId = null;
const docsCache = new Map();

function show(message) {
  output.textContent = message;
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
  } catch (_) {}
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
  if (!form) return;
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
  if (!form.elements.full_name.value.trim()) {
    setFieldError(form.elements.full_name, "Введите ФИО.");
    ok = false;
  }
  if (!emailPattern.test(form.elements.email.value.trim())) {
    setFieldError(form.elements.email, "Введите корректный email.");
    ok = false;
  }
  if ((form.elements.password.value || "").length < 6) {
    setFieldError(form.elements.password, "Пароль: минимум 6 символов.");
    ok = false;
  }
  return ok;
}

function validateUploadForm(form) {
  clearFormErrors(form);
  const file = form.elements.file;
  if (!file.files || !file.files.length) {
    setFieldError(file, "Выберите PDF-файл.");
    return false;
  }
  if (!file.files[0].name.toLowerCase().endsWith(".pdf")) {
    setFieldError(file, "Допустим только формат PDF.");
    return false;
  }
  return true;
}

function validateManualForm(form) {
  clearFormErrors(form);
  let ok = true;
  if (!form.elements.title.value.trim()) {
    setFieldError(form.elements.title, "Укажите название документа.");
    ok = false;
  }
  if (!form.elements.text.value.trim()) {
    setFieldError(form.elements.text, "Введите содержимое документа.");
    ok = false;
  }
  return ok;
}

function validateRuleForm(form) {
  clearFormErrors(form);
  let ok = true;
  if (!form.elements.name.value.trim()) {
    setFieldError(form.elements.name, "Укажите название правила.");
    ok = false;
  }
  const value = form.elements.value.value.trim();
  const ruleType = form.elements.rule_type.value;
  if (!value) {
    setFieldError(form.elements.value, "Укажите значение правила.");
    ok = false;
  } else if (ruleType === "regex") {
    try {
      new RegExp(value);
    } catch (_) {
      setFieldError(form.elements.value, "Некорректный regex-шаблон.");
      ok = false;
    }
  }
  return ok;
}

function updateRuleInputHint(form) {
  if (!form) return;
  const type = form.elements.rule_type.value;
  const input = form.elements.value;
  if (type === "regex") {
    input.placeholder = "Regex-шаблон (например: ^\\s*Введение)";
  } else if (type === "starts_with") {
    input.placeholder = "Например: Введение";
  } else if (type === "contains") {
    input.placeholder = "Например: список литературы";
  } else {
    input.placeholder = "Например: Введение";
  }
}

function validateCheckForm(form) {
  clearFormErrors(form);
  let ok = true;
  const mode = selectedCheckMode();
  if (mode === "existing" && !form.elements.submission_document_id.value) {
    setFieldError(form.elements.submission_document_id, "Выберите проверяемый документ.");
    ok = false;
  }
  if (mode === "raw" && !form.elements.text.value.trim()) {
    setFieldError(form.elements.text, "Введите текст для проверки.");
    ok = false;
  }
  const threshold = Number(form.elements.uniqueness_threshold.value);
  if (Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
    setFieldError(form.elements.uniqueness_threshold, "Введите число от 0 до 100.");
    ok = false;
  }
  return ok;
}

function buildSummaryHtml(result) {
  return `
    <div class="kpi"><span>Оригинальность</span><strong>${result.originality_percent}%</strong></div>
    <div class="kpi"><span>Совпавших токенов</span><strong>${result.matched_tokens}</strong></div>
    <div class="kpi"><span>Всего токенов</span><strong>${result.total_tokens}</strong></div>
    <div class="kpi"><span>Совпадений с источниками</span><strong>${(result.matches || []).length}</strong></div>
  `;
}

function buildMatchesHtml(matches, limit = 10) {
  return matches
    .slice(0, limit)
    .map((m) => {
      const fragment = m.source_fragment || m.fragment || "Фрагмент недоступен";
      return `<div class="match-item">
        <div><strong>${m.source_title}</strong> (${kindLabel[m.source_kind] || m.source_kind})</div>
        <div>Процент перекрытия: ${m.overlap_percent}%</div>
        <div class="muted">Фрагмент: ${fragment}</div>
      </div>`;
    })
    .join("");
}

function renderCheckResult(result) {
  if (!result || typeof result !== "object") {
    currentResult = null;
    currentCheckId = null;
    currentSubmissionDocumentId = null;
    resultSummary.innerHTML = "";
    resultMatches.innerHTML = "";
    highlighted.innerHTML = "";
    btnOpenResultModal.classList.add("hidden");
    btnEditOriginality.classList.add("hidden");
    btnAddArchive.classList.add("hidden");
    return;
  }

  currentResult = result;
  currentCheckId = result.id || null;
  currentSubmissionDocumentId = result.submission_document_id || null;
  resultSummary.innerHTML = buildSummaryHtml(result);
  btnOpenResultModal.classList.remove("hidden");
  btnEditOriginality.classList.remove("hidden");
  btnAddArchive.classList.remove("hidden");

  const matches = result.matches || [];
  resultMatches.innerHTML = matches.length
    ? buildMatchesHtml(matches, 10)
    : '<p class="muted">Совпадений не найдено.</p>';

  highlighted.innerHTML = result.highlighted_html || "";
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
    option.textContent = d.title;
    submissionSelect.appendChild(option);
  });
}

async function loadDocuments() {
  docsBox.textContent = "Загрузка...";
  const docs = await api("/documents");
  docsCache.clear();
  docs.forEach((d) => docsCache.set(d.id, d));

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
        <div class="actions-row">
          <button type="button" class="ghost" data-doc-edit="${d.id}">Редактировать</button>
          <button type="button" class="danger" data-doc-delete="${d.id}">Удалить</button>
        </div>
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
        <div>Режим: ${ruleTypeLabel[r.rule_type] || r.rule_type}</div>
        <div>Значение: <span class="mono">${r.value || ""}</span></div>
        <div>Шаблон: <span class="mono">${r.pattern}</span></div>
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
    show("Сервис доступен.");
  } catch (err) {
    statusPill.textContent = "Сервис: недоступен";
    show(`Ошибка: ${err.message}`);
  }
});

document.getElementById("btn-sync").addEventListener("click", async () => {
  await refreshAll();
  show("Списки обновлены.");
});

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
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try {
    const user = await api("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show(`Пользователь создан: ${user.full_name}`);
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
    show(`Документ сохранен: ${doc.title}`);
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
  const payload = Object.fromEntries(new FormData(manualForm).entries());
  const owner = ownerSelect.value;
  if (owner) payload.owner_user_id = owner;

  try {
    const doc = await api("/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show(`Документ сохранен: ${doc.title}`);
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
  const payload = Object.fromEntries(new FormData(e.target).entries());
  if (!payload.description) delete payload.description;

  try {
    await api("/rules/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show("Правило добавлено.");
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
    show("Правило удалено.");
    await refreshAll();
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

docsBox.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-doc-edit]");
  const delBtn = e.target.closest("[data-doc-delete]");

  if (editBtn) {
    const id = editBtn.getAttribute("data-doc-edit");
    const doc = docsCache.get(id);
    if (!doc) return;
    resultModal.classList.add("hidden");
    editingDocId = id;
    docEditForm.elements.document_id.value = id;
    docEditForm.elements.title.value = doc.title || "";
    docEditForm.elements.kind.value = doc.kind || "submission";
    docEditForm.elements.text.value = "";
    docModal.classList.remove("hidden");
    return;
  }

  if (delBtn) {
    const id = delBtn.getAttribute("data-doc-delete");
    if (!confirm("Удалить документ? Действие необратимо.")) return;
    try {
      await api(`/documents/${id}`, { method: "DELETE" });
      show("Документ удален.");
      await refreshAll();
    } catch (err) {
      show(`Ошибка: ${err.message}`);
    }
  }
});

docEditForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormErrors(docEditForm);
  const id = editingDocId || docEditForm.elements.document_id.value;
  if (!id) return;

  const title = (docEditForm.elements.title.value || "").trim();
  if (!title) {
    setFieldError(docEditForm.elements.title, "Введите название документа.");
    return;
  }

  const payload = {
    title,
    kind: docEditForm.elements.kind.value,
  };
  const text = (docEditForm.elements.text.value || "").trim();
  if (text) payload.text = text;

  try {
    await api(`/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show("Документ обновлен.");
    docModal.classList.add("hidden");
    editingDocId = null;
    await refreshAll();
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

btnDeleteDocument.addEventListener("click", async () => {
  const id = editingDocId || docEditForm.elements.document_id.value;
  if (!id) return;
  if (!confirm("Удалить документ? Действие необратимо.")) return;

  try {
    await api(`/documents/${id}`, { method: "DELETE" });
    show("Документ удален.");
    docModal.classList.add("hidden");
    editingDocId = null;
    await refreshAll();
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

btnCloseDocModal.addEventListener("click", () => {
  docModal.classList.add("hidden");
  editingDocId = null;
});

docModal.addEventListener("click", (e) => {
  if (e.target === docModal) {
    docModal.classList.add("hidden");
    editingDocId = null;
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
    include_unique_archive: true,
    use_exclusion_rules: form.get("use_exclusion_rules") === "on",
    uniqueness_threshold: Number(form.get("uniqueness_threshold") || 80),
  };

  if (mode === "existing") {
    payload.submission_document_id = form.get("submission_document_id");
  } else {
    payload.text = (form.get("text") || "").toString().trim();
  }

  try {
    const result = await api("/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    renderCheckResult(result);
    show(`Проверка завершена. Оригинальность: ${result.originality_percent}%`);
    await refreshAll();
  } catch (err) {
    renderCheckResult(null);
    show(`Ошибка: ${err.message}`);
  }
});

btnOpenResultModal.addEventListener("click", () => {
  if (!currentResult) {
    show("Сначала выполните проверку.");
    return;
  }
  docModal.classList.add("hidden");
  editingDocId = null;
  modalResultSummary.innerHTML = buildSummaryHtml(currentResult);
  const matches = currentResult.matches || [];
  modalResultMatches.innerHTML = matches.length
    ? buildMatchesHtml(matches, 100)
    : '<p class="muted">Совпадений не найдено.</p>';
  modalHighlighted.innerHTML = currentResult.highlighted_html || "";
  resultModal.classList.remove("hidden");
});

btnCloseResultModal.addEventListener("click", () => {
  resultModal.classList.add("hidden");
});

resultModal.addEventListener("click", (e) => {
  if (e.target === resultModal) resultModal.classList.add("hidden");
});

btnEditOriginality.addEventListener("click", async () => {
  if (!currentCheckId) {
    show("Сначала выполните проверку.");
    return;
  }
  const raw = prompt("Введите новый процент оригинальности (0..100):");
  if (raw === null) return;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 100) {
    show("Некорректное значение процента.");
    return;
  }
  try {
    const updated = await api(`/checks/${currentCheckId}/originality`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originality_percent: value }),
    });
    renderCheckResult(updated);
    show(`Процент обновлен: ${value}%.`);
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

btnAddArchive.addEventListener("click", async () => {
  if (!currentSubmissionDocumentId) {
    show("Для этого результата нельзя выполнить действие.");
    return;
  }
  try {
    await api(`/documents/${currentSubmissionDocumentId}/archive`, { method: "POST" });
    show("Работа помечена как уникальная.");
    await refreshAll();
  } catch (err) {
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
watchFieldValidation(docEditForm);
const ruleForm = document.getElementById("rule-form");
ruleForm.elements.rule_type.addEventListener("change", () => updateRuleInputHint(ruleForm));
updateRuleInputHint(ruleForm);
refreshAll();
document.getElementById("btn-health").click();
