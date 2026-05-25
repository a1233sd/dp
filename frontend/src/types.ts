import type { ReactNode } from "react";

export type UserRole = "student" | "teacher";
export type DocumentKind = "reference" | "submission";
export type RuleType = "literal" | "contains" | "starts_with" | "regex" | "pages";

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface AuthPayload {
  token: string;
  user: User;
  profiles: UserProfile[];
  active_profile_id?: string | null;
}

export interface DocumentItem {
  id: string;
  title: string;
  kind: DocumentKind;
  owner_user_id?: string | null;
  source_url?: string | null;
  is_unique: boolean;
  created_at: string;
}

export interface DocumentText extends DocumentItem {
  text: string;
}

export interface ArchiveItem {
  id: string;
  title: string;
  created_at: string;
  owner_user_id?: string | null;
  shingle_size?: number | null;
  token_count?: number | null;
  updated_at?: string | null;
}

export interface ExclusionRule {
  id: string;
  name: string;
  rule_type: RuleType;
  value: string;
  pattern: string;
  description?: string | null;
  owner_user_id?: string | null;
  profile_id?: string | null;
  created_at: string;
}

export interface CheckMatch {
  source_document_id: string;
  source_title: string;
  source_kind: DocumentKind;
  source_url?: string | null;
  overlap_percent: number;
  fragment: string;
  source_fragment: string;
  start_char: number;
  end_char: number;
}

export interface CheckResult {
  id: string;
  submission_document_id?: string | null;
  originality_percent: number;
  matched_tokens: number;
  total_tokens: number;
  processed_text: string;
  highlighted_html: string;
  checked_at: string;
  matches: CheckMatch[];
}

export interface Health {
  status: string;
  documents_total: number;
  unique_archive_total: number;
  users_total: number;
}

export type ServiceStatus = "unknown" | "checking" | "available" | "unavailable";

export interface Settings {
  default_uniqueness_threshold: number;
}

export interface CheckHistoryItem {
  id: string;
  title: string;
  originality_percent: number;
  matched_sources: number;
  checked_at: string;
}

export interface RouteState {
  path: string;
  params: {
    id?: string;
  };
}

export type ApiRequest = <T = unknown>(path: string, options?: RequestInit) => Promise<T>;

export interface PageTitleAction {
  key?: string;
  node: ReactNode;
}
