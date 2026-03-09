const output = document.getElementById("output");
const highlighted = document.getElementById("highlighted");
const docsBox = document.getElementById("docs");
const ownerSelect = document.getElementById("doc-owner-select");
const submissionSelect = document.getElementById("submission-select");
const uploadForm = document.getElementById("upload-form");
const manualForm = document.getElementById("doc-form");
const existingFields = document.getElementById("existing-check-fields");
const rawFields = document.getElementById("raw-check-fields");

const kindLabel = {
  reference: "Эталонный документ",
  submission: "Проверяемая работа",
  external: "Внешний источник",
};
const typeLabel = {
  text: "Текст",
  code: "Код",
};

function show(data) {
  output.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
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

async function loadUsers() {
  const users = await api("/users");
  ownerSelect.innerHTML = '<option value="">Без владельца</option>';
  users.forEach((u) => {
    const option = document.createElement("option");
    option.value = u.id;
    option.textContent = `${u.full_name} (${u.role})`;
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

async function refreshAll() {
  try {
    await Promise.all([loadUsers(), loadSubmissions(), loadDocuments()]);
  } catch (err) {
    show(`Ошибка обновления данных: ${err.message}`);
  }
}

document.getElementById("btn-health").addEventListener("click", async () => {
  try {
    show(await api("/health"));
  } catch (err) {
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

document.getElementById("check-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const mode = selectedCheckMode();

  const payload = {
    include_external_sources: form.get("include_external_sources") === "on",
    include_unique_archive: form.get("include_unique_archive") === "on",
    use_exclusion_rules: form.get("use_exclusion_rules") === "on",
    uniqueness_threshold: Number(form.get("uniqueness_threshold") || 80),
  };

  if (mode === "existing") {
    const submissionId = form.get("submission_document_id");
    if (!submissionId) {
      show("Ошибка: выберите проверяемый документ.");
      return;
    }
    payload.submission_document_id = submissionId;
  } else {
    const rawText = (form.get("text") || "").toString().trim();
    if (!rawText) {
      show("Ошибка: вставьте текст для проверки.");
      return;
    }
    payload.text = rawText;
    payload.content_type = form.get("content_type");
  }

  try {
    const result = await api("/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    show(result);
    highlighted.innerHTML = result.highlighted_html || "";
    await refreshAll();
  } catch (err) {
    highlighted.innerHTML = "";
    show(`Ошибка: ${err.message}`);
  }
});

updateDocModeUI();
updateCheckModeUI();
refreshAll();
