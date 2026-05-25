import type { DocumentKind, RuleType, UserRole } from "../types";

export const TOKEN_KEY = "integrity_auth_token";
export const USER_KEY = "integrity_current_user";
export const PROFILE_KEY = "integrity_active_profile_id";
export const HISTORY_KEY = "integrity_check_history";

export const roleLabel: Record<UserRole, string> = {
  student: "Студент",
  teacher: "Преподаватель",
};

export const kindLabel: Record<DocumentKind, string> = {
  reference: "Эталон",
  submission: "Работа",
};

export const kindColor: Record<DocumentKind, string> = {
  reference: "cyan",
  submission: "gold",
};

export const ruleTypeLabel: Record<RuleType, string> = {
  pages: "Страницы документа",
  literal: "Точная фраза",
  contains: "Строка содержит",
  starts_with: "Строка начинается с",
  regex: "Regex",
};
