const output = document.getElementById("output");
const highlighted = document.getElementById("highlighted");
const docsBox = document.getElementById("docs");
const ownerSelect = document.getElementById("doc-owner-select");
const submissionSelect = document.getElementById("submission-select");
const uploadForm = document.getElementById("upload-form");
const loginForm = document.getElementById("login-form");
const manualForm = document.getElementById("doc-form");
const existingFields = document.getElementById("existing-check-fields");
const rawFields = document.getElementById("raw-check-fields");
const statusPill = document.getElementById("service-status");
const rulesBox = document.getElementById("rules");
const pageRulePresets = document.getElementById("page-rule-presets");
const resultSummary = document.getElementById("result-summary");
const resultMatches = document.getElementById("result-matches");
const btnEditOriginality = document.getElementById("btn-edit-originality");
const btnAddArchive = document.getElementById("btn-add-archive");
const authStatus = document.getElementById("auth-status");
const profilePanel = document.getElementById("profile-panel");
const profileSelect = document.getElementById("profile-select");
const profileForm = document.getElementById("profile-form");
const btnLogout = document.getElementById("btn-logout");
const btnRenameProfile = document.getElementById("btn-rename-profile");
const btnDeleteProfile = document.getElementById("btn-delete-profile");
const docsBulkToolbar = document.getElementById("docs-bulk-toolbar");
const docsSelectAll = document.getElementById("docs-select-all");
const bulkKindSelect = document.getElementById("bulk-kind-select");
const btnBulkKind = document.getElementById("btn-bulk-kind");
const btnBulkDelete = document.getElementById("btn-bulk-delete");

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
  pages: "Страницы документа",
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
const profileCache = new Map();
let defaultUniquenessThreshold = 80;
let authToken = localStorage.getItem("auth_token") || "";
let currentUser = JSON.parse(localStorage.getItem("current_user") || "null");
let activeProfileId = localStorage.getItem("active_profile_id") || "";

function show(message) {
  output.textContent = message;
}

function parseError(payload) {
  if (!payload) return "Неизвестная ошибка";
  if (typeof payload.detail === "string") return payload.detail;
  return JSON.stringify(payload);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const response = await fetch(path, { ...options, headers });
  let data = null;
  try {
    data = await response.json();
  } catch (_) {}
  if (!response.ok) throw new Error(parseError(data));
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clipText(value, limit = 520) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

function saveAuth(auth) {
  authToken = auth.token || "";
  currentUser = auth.user || null;
  activeProfileId = auth.active_profile_id || (auth.profiles && auth.profiles[0] && auth.profiles[0].id) || "";
  localStorage.setItem("auth_token", authToken);
  localStorage.setItem("current_user", JSON.stringify(currentUser));
  localStorage.setItem("active_profile_id", activeProfileId);
  renderAuth(auth.profiles || []);
}

function clearAuth() {
  authToken = "";
  currentUser = null;
  activeProfileId = "";
  localStorage.removeItem("auth_token");
  localStorage.removeItem("current_user");
  localStorage.removeItem("active_profile_id");
  renderAuth([]);
}

function renderAuth(profiles = []) {
  profileCache.clear();
  if (!currentUser) {
    authStatus.textContent = "Вы не вошли в систему.";
    profilePanel.classList.add("hidden");
    btnLogout.classList.add("hidden");
    return;
  }

  authStatus.textContent = `Вход: ${currentUser.full_name} (${roleLabel[currentUser.role] || currentUser.role})`;
  btnLogout.classList.remove("hidden");
  profilePanel.classList.remove("hidden");
  profileSelect.innerHTML = "";
  profiles.forEach((profile) => {
    profileCache.set(profile.id, profile);
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    profileSelect.appendChild(option);
  });
  if (activeProfileId && profiles.some((profile) => profile.id === activeProfileId)) {
    profileSelect.value = activeProfileId;
  } else if (profiles[0]) {
    activeProfileId = profiles[0].id;
    profileSelect.value = activeProfileId;
    localStorage.setItem("active_profile_id", activeProfileId);
  }
  btnDeleteProfile.disabled = profiles.length <= 1;
}

async function restoreAuth() {
  renderAuth([]);
  if (!authToken) return;
  try {
    const auth = await api("/me");
    saveAuth(auth);
  } catch (_) {
    clearAuth();
  }
}

function parsePageRanges(value) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  const pages = new Set();
  for (const part of parts) {
    const match = part.match(/^(\d+)\s*(?:[-–—]\s*(\d+))?$/);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function openResultPage(checkId) {
  return `/checks/view/${encodeURIComponent(checkId)}`;
}

function openPendingResultWindow() {
  const win = window.open("", "_blank");
  if (!win) return null;
  win.document.title = "Проверка выполняется";
  win.document.body.innerHTML =
    '<main style="font:16px system-ui;padding:32px;color:#1f2937">Проверка выполняется, результат откроется автоматически.</main>';
  return win;
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
    setFieldError(file, "Выберите один или несколько файлов.");
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
  } else if (ruleType === "pages" && !parsePageRanges(value)) {
    setFieldError(form.elements.value, "Введите страницы в формате 1-2, 5.");
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
  if (pageRulePresets) pageRulePresets.classList.toggle("hidden", type !== "pages");
  if (type === "pages") {
    input.placeholder = "Страницы: 1-2, 5";
  } else if (type === "regex") {
    input.placeholder = "Regex-шаблон (например: ^\\s*Введение)";
  } else if (type === "starts_with") {
    input.placeholder = "Например: Введение";
  } else if (type === "contains") {
    input.placeholder = "Например: список литературы";
  } else {
    input.placeholder = "Например: Введение";
  }
}

function selectedDocumentIds() {
  return [...docsBox.querySelectorAll(".doc-select:checked")]
    .map((checkbox) => checkbox.value)
    .filter(Boolean);
}

function updateDocsSelectionUI() {
  const checkboxes = [...docsBox.querySelectorAll(".doc-select")];
  const selected = checkboxes.filter((checkbox) => checkbox.checked);
  if (docsSelectAll) {
    docsSelectAll.checked = checkboxes.length > 0 && selected.length === checkboxes.length;
    docsSelectAll.indeterminate = selected.length > 0 && selected.length < checkboxes.length;
  }
  const disabled = selected.length === 0;
  btnBulkKind.disabled = disabled;
  btnBulkDelete.disabled = disabled;
}

function duplicateUploadNames(files, title = "") {
  const existingTitles = new Set(
    [...docsCache.values()].map((doc) => String(doc.title || "").trim().toLowerCase()),
  );
  const selectedNames = files.map((file) => String(file.name || "").trim()).filter(Boolean);
  const names = files.length === 1 && title.trim()
    ? [...selectedNames, title.trim()]
    : selectedNames;
  const seen = new Set();
  const duplicates = [];

  names.forEach((name) => {
    const key = name.toLowerCase();
    if (existingTitles.has(key) || seen.has(key)) duplicates.push(name);
    seen.add(key);
  });
  return duplicates;
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
    .map((m, index) => {
      const fragment = clipText(m.fragment || "Фрагмент недоступен");
      const sourceFragment = clipText(m.source_fragment || "Фрагмент источника недоступен");
      return `<div class="match-item">
        <div class="match-head">
          <strong>${index + 1}. ${escapeHtml(m.source_title)}</strong>
          <span>${m.overlap_percent}%</span>
        </div>
        <div class="muted">${escapeHtml(kindLabel[m.source_kind] || m.source_kind)} · символы ${m.start_char}-${m.end_char}</div>
        <div class="fragment-pair compact">
          <div><span>В работе</span><p>${escapeHtml(fragment)}</p></div>
          <div><span>В источнике</span><p>${escapeHtml(sourceFragment)}</p></div>
        </div>
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
  if (currentUser && users.some((user) => user.id === currentUser.id)) {
    ownerSelect.value = currentUser.id;
  }
}

async function loadSettings() {
  const settings = await api("/settings");
  defaultUniquenessThreshold = Number(settings.default_uniqueness_threshold ?? 80);
  const thresholdInput = document.getElementById("uniqueness-threshold");
  if (thresholdInput) {
    thresholdInput.value = String(defaultUniquenessThreshold);
  }
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
  docsBulkToolbar.classList.toggle("hidden", !docs.length);
  if (docsSelectAll) {
    docsSelectAll.checked = false;
    docsSelectAll.indeterminate = false;
  }

  if (!docs.length) {
    docsBox.textContent = "Документов пока нет.";
    updateDocsSelectionUI();
    return;
  }

  docsBox.innerHTML = docs
    .map(
      (d) => `<div class="doc-item">
        <label class="doc-check-row">
          <input type="checkbox" class="doc-select" value="${escapeHtml(d.id)}" />
          <strong>${escapeHtml(d.title)}</strong>
        </label>
        <div>ID: ${escapeHtml(d.id)}</div>
        <div>Категория: ${escapeHtml(kindLabel[d.kind] || d.kind)}</div>
        <div class="actions-row">
          <button type="button" class="ghost" data-doc-edit="${d.id}">Редактировать</button>
          <button type="button" class="danger" data-doc-delete="${d.id}">Удалить</button>
        </div>
      </div>`,
    )
    .join("");
  updateDocsSelectionUI();
}

async function loadRules() {
  const query = activeProfileId ? `?profile_id=${encodeURIComponent(activeProfileId)}` : "";
  const rules = await api(`/rules/exclusions${query}`);
  if (!rules.length) {
    rulesBox.innerHTML = '<p class="muted">Правила не добавлены.</p>';
    return;
  }
  rulesBox.innerHTML = rules
    .map((r) => {
      const isPages = r.rule_type === "pages";
      return `<div class="doc-item">
        <div><strong>${escapeHtml(r.name)}</strong></div>
        <div>Режим: ${escapeHtml(ruleTypeLabel[r.rule_type] || r.rule_type)}</div>
        <div>${isPages ? "Страницы" : "Значение"}: <span class="mono">${escapeHtml(r.value || "")}</span></div>
        ${isPages ? "" : `<div>Шаблон: <span class="mono">${escapeHtml(r.pattern)}</span></div>`}
        ${r.description ? `<div class="muted">${escapeHtml(r.description)}</div>` : ""}
        <button type="button" class="danger" data-del-rule="${r.id}">Удалить</button>
      </div>`;
    })
    .join("");
}

async function refreshAll() {
  try {
    await Promise.all([loadSettings(), loadUsers(), loadSubmissions(), loadDocuments(), loadRules()]);
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

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormErrors(loginForm);
  const payload = Object.fromEntries(new FormData(loginForm).entries());
  try {
    const auth = await api("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    saveAuth(auth);
    show(`Вы вошли как ${auth.user.full_name}.`);
    await refreshAll();
  } catch (err) {
    show(`Ошибка входа: ${err.message}`);
  }
});

btnLogout.addEventListener("click", async () => {
  clearAuth();
  await refreshAll();
  show("Вы вышли из системы.");
});

profileSelect.addEventListener("change", async () => {
  activeProfileId = profileSelect.value;
  localStorage.setItem("active_profile_id", activeProfileId);
  await loadRules();
  show("Профиль правил переключен.");
});

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormErrors(profileForm);
  const name = profileForm.elements.name.value.trim();
  if (!name) {
    setFieldError(profileForm.elements.name, "Введите название профиля.");
    return;
  }
  try {
    const profile = await api("/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const auth = await api("/me");
    activeProfileId = profile.id;
    localStorage.setItem("active_profile_id", activeProfileId);
    saveAuth({ ...auth, active_profile_id: activeProfileId });
    profileForm.reset();
    await loadRules();
    show(`Профиль создан: ${profile.name}`);
  } catch (err) {
    show(`Ошибка профиля: ${err.message}`);
  }
});

btnRenameProfile.addEventListener("click", async () => {
  if (!activeProfileId) {
    show("Сначала выберите профиль.");
    return;
  }
  const currentProfile = profileCache.get(activeProfileId);
  const raw = prompt("Новое название профиля:", currentProfile ? currentProfile.name : "");
  if (raw === null) return;
  const name = raw.trim();
  if (!name) {
    show("Название профиля не должно быть пустым.");
    return;
  }
  try {
    const profile = await api(`/profiles/${activeProfileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const auth = await api("/me");
    saveAuth({ ...auth, active_profile_id: profile.id });
    show(`Профиль переименован: ${profile.name}`);
  } catch (err) {
    show(`Ошибка профиля: ${err.message}`);
  }
});

btnDeleteProfile.addEventListener("click", async () => {
  if (!activeProfileId) {
    show("Сначала выберите профиль.");
    return;
  }
  const currentProfile = profileCache.get(activeProfileId);
  const name = currentProfile ? currentProfile.name : "выбранный профиль";
  if (!confirm(`Удалить профиль "${name}" и его правила?`)) return;
  try {
    const result = await api(`/profiles/${activeProfileId}`, { method: "DELETE" });
    const auth = await api("/me");
    activeProfileId = result.active_profile_id || auth.active_profile_id || "";
    localStorage.setItem("active_profile_id", activeProfileId);
    saveAuth({ ...auth, active_profile_id: activeProfileId });
    await loadRules();
    show("Профиль удален.");
  } catch (err) {
    show(`Ошибка профиля: ${err.message}`);
  }
});

document.querySelectorAll('input[name="doc_mode"]').forEach((el) => {
  el.addEventListener("change", updateDocModeUI);
});

document.querySelectorAll('input[name="check_mode"]').forEach((el) => {
  el.addEventListener("change", updateCheckModeUI);
});

if (pageRulePresets) {
  pageRulePresets.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rule-preset-name]");
    if (!btn) return;
    const form = document.getElementById("rule-form");
    form.elements.rule_type.value = "pages";
    form.elements.name.value = btn.getAttribute("data-rule-preset-name") || "";
    const pages = btn.getAttribute("data-rule-preset-pages") || "";
    if (pages) form.elements.value.value = pages;
    updateRuleInputHint(form);
    form.elements.value.focus();
  });
}

document.getElementById("user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateUserForm(e.target)) {
    show("Проверьте поля формы пользователя.");
    return;
  }
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try {
    const auth = await api("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    saveAuth(auth);
    show(`Пользователь создан: ${auth.user.full_name}`);
    e.target.reset();
    await refreshAll();
    ownerSelect.value = auth.user.id;
  } catch (err) {
    show(`Ошибка: ${err.message}`);
  }
});

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateUploadForm(uploadForm)) {
    show("Проверьте форму загрузки файлов.");
    return;
  }
  const files = [...uploadForm.elements.file.files];
  const owner = ownerSelect.value;
  const kind = uploadForm.elements.kind.value;
  const duplicateNames = duplicateUploadNames(files, uploadForm.elements.title.value || "");
  if (duplicateNames.length) {
    show(`Файл уже существует: ${duplicateNames.join(", ")}`);
    setFieldError(uploadForm.elements.file, "Файл с таким именем уже есть в списке документов.");
    return;
  }

  try {
    if (files.length === 1) {
      const form = new FormData(uploadForm);
      if (!form.get("title")) form.delete("title");
      if (owner) form.set("owner_user_id", owner);
      else form.delete("owner_user_id");
      const doc = await api("/documents/upload", { method: "POST", body: form });
      show(`Документ сохранен: ${doc.title}`);
    } else {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      form.set("kind", kind);
      if (owner) form.set("owner_user_id", owner);
      const result = await api("/documents/upload/batch", { method: "POST", body: form });
      show(`Массовая загрузка: сохранено ${result.saved} из ${result.total}, ошибок ${result.failed}.`);
    }
    uploadForm.reset();
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
  if (currentUser) payload.owner_user_id = currentUser.id;
  if (activeProfileId) payload.profile_id = activeProfileId;

  try {
    await api("/rules/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show("Правило добавлено.");
    e.target.reset();
    updateRuleInputHint(e.target);
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

docsBox.addEventListener("change", (e) => {
  if (e.target.classList.contains("doc-select")) updateDocsSelectionUI();
});

docsSelectAll.addEventListener("change", () => {
  docsBox.querySelectorAll(".doc-select").forEach((checkbox) => {
    checkbox.checked = docsSelectAll.checked;
  });
  updateDocsSelectionUI();
});

btnBulkKind.addEventListener("click", async () => {
  const ids = selectedDocumentIds();
  if (!ids.length) {
    show("Выберите документы.");
    return;
  }
  const kind = bulkKindSelect.value;
  try {
    await Promise.all(
      ids.map((id) =>
        api(`/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        }),
      ),
    );
    show(`Тип обновлен у документов: ${ids.length}.`);
    await refreshAll();
  } catch (err) {
    show(`Ошибка массового изменения: ${err.message}`);
  }
});

btnBulkDelete.addEventListener("click", async () => {
  const ids = selectedDocumentIds();
  if (!ids.length) {
    show("Выберите документы.");
    return;
  }
  if (!confirm(`Удалить выбранные документы: ${ids.length}? Действие необратимо.`)) return;
  try {
    await Promise.all(ids.map((id) => api(`/documents/${id}`, { method: "DELETE" })));
    show(`Удалено документов: ${ids.length}.`);
    await refreshAll();
  } catch (err) {
    show(`Ошибка массового удаления: ${err.message}`);
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
    uniqueness_threshold: Number(form.get("uniqueness_threshold") || defaultUniquenessThreshold),
  };
  if (currentUser) payload.owner_user_id = currentUser.id;
  if (activeProfileId) payload.profile_id = activeProfileId;

  if (mode === "existing") {
    payload.submission_document_id = form.get("submission_document_id");
  } else {
    payload.text = (form.get("text") || "").toString().trim();
  }

  const resultWindow = openPendingResultWindow();
  try {
    const result = await api("/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    renderCheckResult(result);
    const resultUrl = openResultPage(result.id);
    if (resultWindow && !resultWindow.closed) {
      resultWindow.location.href = resultUrl;
    }
    show(`Проверка завершена. Оригинальность: ${result.originality_percent}%. Страница результата: ${resultUrl}`);
    await refreshAll();
  } catch (err) {
    if (resultWindow && !resultWindow.closed) resultWindow.close();
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
watchFieldValidation(loginForm);
watchFieldValidation(document.getElementById("user-form"));
watchFieldValidation(profileForm);
watchFieldValidation(uploadForm);
watchFieldValidation(manualForm);
watchFieldValidation(document.getElementById("rule-form"));
watchFieldValidation(document.getElementById("check-form"));
watchFieldValidation(docEditForm);
const ruleForm = document.getElementById("rule-form");
ruleForm.elements.rule_type.addEventListener("change", () => updateRuleInputHint(ruleForm));
updateRuleInputHint(ruleForm);

(async () => {
  await restoreAuth();
  await refreshAll();
  document.getElementById("btn-health").click();
})();
