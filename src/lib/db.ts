import Database from 'better-sqlite3';
import { config } from './config';

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    text_content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cloud_link TEXT,
    added_to_cloud INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS checks (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    status TEXT NOT NULL,
    similarity REAL,
    matches TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY(report_id) REFERENCES reports(id)
  );
`);

type TableColumn = { name: string };

const reportColumns = db.prepare(`PRAGMA table_info(reports)`).all() as TableColumn[];

if (!reportColumns.some((column) => column.name === 'cloud_link')) {
  db.prepare(`ALTER TABLE reports ADD COLUMN cloud_link TEXT`).run();
}

if (!reportColumns.some((column) => column.name === 'added_to_cloud')) {
  db.prepare(`ALTER TABLE reports ADD COLUMN added_to_cloud INTEGER NOT NULL DEFAULT 0`).run();
}

export default db;
