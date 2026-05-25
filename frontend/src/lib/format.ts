import type { ProgressProps } from "antd";

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

export function shortId(value?: string | null): string {
  return String(value || "").slice(0, 8);
}

export function scoreStatus(value?: number | null): ProgressProps["status"] {
  const percent = Number(value) || 0;
  if (percent >= 85) return "success";
  if (percent >= 70) return "normal";
  return "exception";
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
