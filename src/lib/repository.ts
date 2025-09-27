import { randomUUID } from 'crypto';
import db from './db';

export interface ReportRecord {
  id: string;
  original_name: string;
  stored_name: string;
  text_content: string;
  created_at: string;
}

export interface CheckRecord {
  id: string;
  report_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  similarity: number | null;
  matches: string | null;
  created_at: string;
  completed_at: string | null;
}

export function createReport(record: Omit<ReportRecord, 'id' | 'created_at'> & { id?: string }): ReportRecord {
  const id = record.id ?? randomUUID();
  const created_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO reports (id, original_name, stored_name, text_content, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, record.original_name, record.stored_name, record.text_content, created_at);
  return {
    id,
    original_name: record.original_name,
    stored_name: record.stored_name,
    text_content: record.text_content,
    created_at,
  };
}

export function listReports(): ReportRecord[] {
  return db.prepare(`SELECT * FROM reports ORDER BY datetime(created_at) DESC`).all() as ReportRecord[];
}

export function getReportById(id: string): ReportRecord | undefined {
  return db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id) as ReportRecord | undefined;
}

export function createCheck(record: Omit<CheckRecord, 'id' | 'created_at' | 'completed_at'> & { id?: string; created_at?: string; completed_at?: string | null }): CheckRecord {
  const id = record.id ?? randomUUID();
  const created_at = record.created_at ?? new Date().toISOString();
  const completed_at = record.completed_at ?? null;
  db.prepare(
    `INSERT INTO checks (id, report_id, status, similarity, matches, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, record.report_id, record.status, record.similarity ?? null, record.matches ?? null, created_at, completed_at);
  return {
    id,
    report_id: record.report_id,
    status: record.status,
    similarity: record.similarity ?? null,
    matches: record.matches ?? null,
    created_at,
    completed_at,
  };
}

export function updateCheck(id: string, updates: Partial<Omit<CheckRecord, 'id' | 'report_id'>> & { status?: CheckRecord['status'] }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (typeof updates.similarity === 'number') {
    fields.push('similarity = ?');
    values.push(updates.similarity);
  }
  if (updates.matches !== undefined) {
    fields.push('matches = ?');
    values.push(updates.matches);
  }
  if (updates.created_at) {
    fields.push('created_at = ?');
    values.push(updates.created_at);
  }
  if (updates.completed_at !== undefined) {
    fields.push('completed_at = ?');
    values.push(updates.completed_at);
  }

  if (!fields.length) {
    return;
  }

  values.push(id);
  db.prepare(`UPDATE checks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getCheckById(id: string): CheckRecord | undefined {
  return db.prepare(`SELECT * FROM checks WHERE id = ?`).get(id) as CheckRecord | undefined;
}

export function listChecks(): CheckRecord[] {
  return db.prepare(`SELECT * FROM checks ORDER BY datetime(created_at) DESC`).all() as CheckRecord[];
}

export function findLatestCheckForReport(reportId: string): CheckRecord | undefined {
  return db
    .prepare(`SELECT * FROM checks WHERE report_id = ? ORDER BY datetime(created_at) DESC LIMIT 1`)
    .get(reportId) as CheckRecord | undefined;
}
