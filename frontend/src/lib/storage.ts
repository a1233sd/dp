import { HISTORY_KEY } from "./constants";
import type { CheckHistoryItem, CheckResult } from "../types";

export function readStorageJSON<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) || "") as T) || fallback;
  } catch {
    return fallback;
  }
}

interface RequestFailureContext {
  body?: string;
  path?: string;
  status?: number;
  statusText?: string;
}

export function parseError(payload: unknown, context: RequestFailureContext = {}): string {
  if (payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string") {
    return payload.detail;
  }
  if (payload) return JSON.stringify(payload);

  const target = context.path ? ` ${context.path}` : "";
  const status = context.status ? `HTTP ${context.status}` : "без ответа";
  const body = context.body?.trim();

  if (body?.startsWith("<!doctype html") || body?.startsWith("<html")) {
    return `API-запрос${target} вернул HTML вместо JSON (${status}). Проверьте, что открыт адрес FastAPI, а не только frontend dev server.`;
  }

  return `Не удалось выполнить API-запрос${target} (${status}${context.statusText ? ` ${context.statusText}` : ""}).`;
}

export function loadHistory(): CheckHistoryItem[] {
  return readStorageJSON<CheckHistoryItem[]>(HISTORY_KEY, []);
}

export function saveHistory(items: CheckHistoryItem[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
}

export function appendHistory(result: CheckResult, title?: string | null): CheckHistoryItem[] {
  const next = [
    {
      id: result.id,
      title: title || result.submission_document_id || "Проверка без названия",
      originality_percent: result.originality_percent,
      matched_sources: result.matches.length,
      checked_at: result.checked_at,
    },
    ...loadHistory().filter((item) => item.id !== result.id),
  ];
  saveHistory(next);
  return next;
}
