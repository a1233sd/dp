import Database from 'better-sqlite3';
import { config } from './config';

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');

const createReportsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      text_index TEXT NOT NULL,
      created_at TEXT NOT NULL,
      cloud_link TEXT,
      added_to_cloud INTEGER NOT NULL DEFAULT 0,
      priority_indexed_at TEXT
    );
  `);
};

const createChecksTable = () => {
  db.exec(`
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
};

createReportsTable();
createChecksTable();

type TableColumn = { name: string };
type TableName = { name: string };
type SqliteError = Error & { code?: string };

const isMissingReportsOldError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const withCode = error as SqliteError;
  if (withCode.code !== 'SQLITE_ERROR') {
    return false;
  }

  return error.message.includes('reports_old');
};

const reportsOldExists = (): boolean => {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as TableName[];
  return tables.some((table) => table.name === 'reports_old');
};

const migrateReportsOldTable = () => {
  try {
    if (!reportsOldExists()) {
      return;
    }

    // Ensure the target table exists after a rename.
    createReportsTable();

    const legacyColumns = db.prepare(`PRAGMA table_info(reports_old)`).all() as TableColumn[];
    const hasLegacyTextIndex = legacyColumns.some((column) => column.name === 'text_index');
    const hasLegacyCloudLink = legacyColumns.some((column) => column.name === 'cloud_link');
    const hasLegacyAddedToCloud = legacyColumns.some((column) => column.name === 'added_to_cloud');

    const textIndexSelect = hasLegacyTextIndex ? 'text_index' : "''";
    const cloudLinkSelect = hasLegacyCloudLink ? 'cloud_link' : 'NULL';
    const addedToCloudSelect = hasLegacyAddedToCloud ? 'added_to_cloud' : '0';

    db.exec(`
      INSERT OR REPLACE INTO reports (id, original_name, stored_name, text_index, created_at, cloud_link, added_to_cloud)
      SELECT id, original_name, stored_name, ${textIndexSelect} AS text_index, created_at, ${cloudLinkSelect} AS cloud_link, ${addedToCloudSelect} AS added_to_cloud
      FROM reports_old;
    `);

    db.exec('DROP TABLE IF EXISTS reports_old;');
  } catch (error) {
    if (isMissingReportsOldError(error)) {
      return;
    }

    throw error;
  }
};

// If a previous migration failed we may still have a legacy table.
migrateReportsOldTable();

const reportColumns = db.prepare(`PRAGMA table_info(reports)`).all() as TableColumn[];

const hasTextIndex = reportColumns.some((column) => column.name === 'text_index');
const hasTextContent = reportColumns.some((column) => column.name === 'text_content');

if (!hasTextIndex) {
  if (hasTextContent) {
    db.exec(`ALTER TABLE reports RENAME TO reports_old;`);
    createReportsTable();
    migrateReportsOldTable();
  } else {
    db.prepare(`ALTER TABLE reports ADD COLUMN text_index TEXT NOT NULL DEFAULT ''`).run();
  }
}

const updatedReportColumns = db.prepare(`PRAGMA table_info(reports)`).all() as TableColumn[];

if (!updatedReportColumns.some((column) => column.name === 'cloud_link')) {
  db.prepare(`ALTER TABLE reports ADD COLUMN cloud_link TEXT`).run();
}

if (!updatedReportColumns.some((column) => column.name === 'added_to_cloud')) {
  db.prepare(`ALTER TABLE reports ADD COLUMN added_to_cloud INTEGER NOT NULL DEFAULT 0`).run();
}

if (!updatedReportColumns.some((column) => column.name === 'priority_indexed_at')) {
  db.prepare(`ALTER TABLE reports ADD COLUMN priority_indexed_at TEXT`).run();
}

// Clean up again in case a new migration produced reports_old during this execution.
migrateReportsOldTable();

export default db;
