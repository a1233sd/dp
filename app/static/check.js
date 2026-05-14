const statusLine = document.getElementById("status-line");
const meta = document.getElementById("check-meta");
const scoreMeter = document.getElementById("score-meter");
const scoreValue = document.getElementById("score-value");
const kpis = document.getElementById("check-kpis");
const matchesList = document.getElementById("matches-list");
const matchFilter = document.getElementById("match-filter");
const documentView = document.getElementById("document-view");
const readerCount = document.getElementById("reader-count");
const comparePanel = document.getElementById("compare-panel");
const compareTitle = document.getElementById("compare-title");
const compareSource = document.getElementById("compare-source");
const comparePercent = document.getElementById("compare-percent");
const queryFragment = document.getElementById("query-fragment");
const sourceFragment = document.getElementById("source-fragment");
const btnEditOriginality = document.getElementById("btn-edit-originality");
const btnAddArchive = document.getElementById("btn-add-archive");
const btnPrint = document.getElementById("btn-print");

const kindLabel = {
  reference: "Уникальный документ",
  submission: "Проверяемая работа",
};

let currentResult = null;
let selectedMatchIndex = 0;

function getCheckId() {
  const pathMatch = window.location.pathname.match(/\/checks\/view\/([^/]+)/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  return new URLSearchParams(window.location.search).get("check_id");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clipText(value, limit = 260) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  let data = null;
  try {
    data = await response.json();
  } catch (_) {}
  if (!response.ok) {
    const detail = data && typeof data.detail === "string" ? data.detail : "Не удалось выполнить запрос";
    throw new Error(detail);
  }
  return data;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleString("ru-RU");
}

function buildSummaryHtml(result) {
  return `
    <div class="kpi"><span>Оригинальность</span><strong>${result.originality_percent}%</strong></div>
    <div class="kpi"><span>Совпавших токенов</span><strong>${result.matched_tokens}</strong></div>
    <div class="kpi"><span>Всего токенов</span><strong>${result.total_tokens}</strong></div>
    <div class="kpi"><span>Источников</span><strong>${(result.matches || []).length}</strong></div>
  `;
}

function setScore(percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  scoreValue.textContent = `${value}%`;
  scoreMeter.style.background = `conic-gradient(#10b981 ${value * 3.6}deg, #334155 0deg)`;
}

function sharedWords(first, second) {
  const wordPattern = /[\p{L}\p{N}_-]+/gu;
  const firstWords = new Set(String(first || "").toLowerCase().match(wordPattern) || []);
  const secondWords = new Set(String(second || "").toLowerCase().match(wordPattern) || []);
  return new Set([...firstWords].filter((word) => word.length > 2 && secondWords.has(word)));
}

function highlightSharedWords(text, shared) {
  const wordPattern = /([\p{L}\p{N}_-]+)/gu;
  return escapeHtml(text).replace(wordPattern, (token) => {
    return shared.has(token.toLowerCase()) ? `<mark class="shared-word">${token}</mark>` : token;
  });
}

function sortedMatches(result) {
  return (result.matches || [])
    .map((match, index) => ({ ...match, index }))
    .sort((a, b) => b.overlap_percent - a.overlap_percent || a.start_char - b.start_char);
}

function filteredMatches() {
  if (!currentResult) return [];
  const query = matchFilter.value.trim().toLowerCase();
  const matches = sortedMatches(currentResult);
  if (!query) return matches;
  return matches.filter((match) => `${match.source_title} ${match.fragment}`.toLowerCase().includes(query));
}

function renderMatches() {
  const matches = filteredMatches();
  if (!matches.length) {
    matchesList.innerHTML = '<p class="muted">Совпадений по фильтру не найдено.</p>';
    return;
  }

  matchesList.innerHTML = matches
    .map(
      (match) => `<button type="button" class="match-card ${match.index === selectedMatchIndex ? "active" : ""}" data-match-index="${match.index}">
        <strong>${escapeHtml(match.source_title)}</strong>
        <div class="muted">${escapeHtml(kindLabel[match.source_kind] || match.source_kind)} · символы ${match.start_char}-${match.end_char}</div>
        <p>${escapeHtml(clipText(match.fragment))}</p>
        <span class="source-percent">${match.overlap_percent}%</span>
      </button>`,
    )
    .join("");
}

function renderDocument() {
  const text = currentResult.processed_text || "";
  const intervals = (currentResult.matches || [])
    .map((match, index) => ({
      start: Number(match.start_char),
      end: Number(match.end_char),
      index,
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cursor = 0;
  const chunks = [];
  for (const item of intervals) {
    const start = Math.max(item.start, cursor);
    const end = Math.min(item.end, text.length);
    if (end <= cursor) continue;
    if (cursor < start) chunks.push(escapeHtml(text.slice(cursor, start)));
    chunks.push(
      `<mark class="doc-hit ${item.index === selectedMatchIndex ? "active" : ""}" data-match-index="${item.index}">${escapeHtml(
        text.slice(start, end),
      )}</mark>`,
    );
    cursor = end;
  }
  if (cursor < text.length) chunks.push(escapeHtml(text.slice(cursor)));
  documentView.innerHTML = chunks.join("") || '<p class="muted">Текст результата пуст.</p>';
}

function renderComparison() {
  const matches = currentResult.matches || [];
  const match = matches[selectedMatchIndex] || matches[0];
  if (!match) {
    compareTitle.textContent = "Совпадений нет";
    compareSource.textContent = "";
    comparePercent.textContent = "";
    queryFragment.innerHTML = '<p class="muted">В этой проверке совпадающие фрагменты не найдены.</p>';
    sourceFragment.innerHTML = "";
    return;
  }

  selectedMatchIndex = match === matches[selectedMatchIndex] ? selectedMatchIndex : 0;
  const shared = sharedWords(match.fragment, match.source_fragment);
  compareTitle.textContent = "Сравнение фрагментов";
  compareSource.textContent = match.source_title;
  comparePercent.textContent = `${match.overlap_percent}%`;
  queryFragment.innerHTML = highlightSharedWords(match.fragment || "", shared);
  sourceFragment.innerHTML = highlightSharedWords(match.source_fragment || "", shared);
}

function renderResult(result) {
  currentResult = result;
  selectedMatchIndex = 0;
  meta.textContent = `ID проверки: ${result.id} · ${formatDate(result.checked_at)}`;
  statusLine.textContent = "Результат загружен.";
  kpis.innerHTML = buildSummaryHtml(result);
  setScore(result.originality_percent);
  readerCount.textContent = `${(result.matches || []).length} совпадений`;
  btnAddArchive.disabled = !result.submission_document_id;
  renderMatches();
  renderDocument();
  renderComparison();
}

function selectMatch(index, shouldScroll = true) {
  if (!currentResult || !currentResult.matches[index]) return;
  selectedMatchIndex = index;
  renderMatches();
  renderDocument();
  renderComparison();
  const active = documentView.querySelector(`.doc-hit[data-match-index="${index}"]`);
  if (active && shouldScroll) active.scrollIntoView({ behavior: "smooth", block: "center" });
  comparePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

matchesList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-match-index]");
  if (!card) return;
  selectMatch(Number(card.getAttribute("data-match-index")));
});

documentView.addEventListener("click", (event) => {
  const hit = event.target.closest("[data-match-index]");
  if (!hit) return;
  selectMatch(Number(hit.getAttribute("data-match-index")), false);
});

matchFilter.addEventListener("input", renderMatches);

btnPrint.addEventListener("click", () => window.print());

btnEditOriginality.addEventListener("click", async () => {
  if (!currentResult) return;
  const raw = prompt("Введите новый процент оригинальности (0..100):", currentResult.originality_percent);
  if (raw === null) return;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 100) {
    statusLine.textContent = "Некорректное значение процента.";
    return;
  }
  try {
    const updated = await api(`/checks/${currentResult.id}/originality`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originality_percent: value }),
    });
    renderResult(updated);
  } catch (error) {
    statusLine.textContent = `Ошибка: ${error.message}`;
  }
});

btnAddArchive.addEventListener("click", async () => {
  if (!currentResult || !currentResult.submission_document_id) return;
  try {
    await api(`/documents/${currentResult.submission_document_id}/archive`, { method: "POST" });
    statusLine.textContent = "Работа добавлена в архив уникальных документов.";
  } catch (error) {
    statusLine.textContent = `Ошибка: ${error.message}`;
  }
});

async function loadResult() {
  const checkId = getCheckId();
  if (!checkId) {
    statusLine.textContent = "Не указан ID проверки.";
    return;
  }
  try {
    const result = await api(`/checks/${encodeURIComponent(checkId)}`);
    renderResult(result);
  } catch (error) {
    statusLine.textContent = `Ошибка: ${error.message}`;
    meta.textContent = "Результат не найден.";
  }
}

loadResult();
