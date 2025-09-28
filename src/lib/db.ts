import Database from 'better-sqlite3';
import { config } from './config';

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');

const createReportsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      text_index TEXT NOT NULL,
      created_at TEXT NOT NULL,
      cloud_link TEXT,
      added_to_cloud INTEGER NOT NULL DEFAULT 0
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
type ForeignKey = { table: string };
type SqliteError = Error & { code?: string };

const tableExists = (tableName: string): boolean => {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as TableName[];
  return tables.some((table) => table.name === tableName);
};

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

const reportsOldExists = (): boolean => tableExists('reports_old');

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
      INSERT OR REPLACE INTO reports (id, original_name, text_index, created_at, cloud_link, added_to_cloud)
      SELECT id, original_name, ${textIndexSelect} AS text_index, created_at, ${cloudLinkSelect} AS cloud_link, ${addedToCloudSelect} AS added_to_cloud
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

const checksForeignKeys = db.prepare(`PRAGMA foreign_key_list(checks)`).all() as ForeignKey[];

const checksReferencesReportsOld = checksForeignKeys.some((foreignKey) => foreignKey.table === 'reports_old');

const checksOldExists = tableExists('checks_old');

if (checksReferencesReportsOld || checksOldExists) {
  if (!checksOldExists) {
    db.exec(`ALTER TABLE checks RENAME TO checks_old;`);
  }

  createChecksTable();

  if (tableExists('checks_old')) {
    db.exec(`
      INSERT OR REPLACE INTO checks (id, report_id, status, similarity, matches, created_at, completed_at)
      SELECT id, report_id, status, similarity, matches, created_at, completed_at
      FROM checks_old
      WHERE report_id IN (SELECT id FROM reports);
    `);
    db.exec('DROP TABLE IF EXISTS checks_old;');
  }
}

const reportColumns = db.prepare(`PRAGMA table_info(reports)`).all() as TableColumn[];

const hasTextIndex = reportColumns.some((column) => column.name === 'text_index');
const hasTextContent = reportColumns.some((column) => column.name === 'text_content');
const hasStoredName = reportColumns.some((column) => column.name === 'stored_name');

if (hasStoredName || (hasTextContent && !hasTextIndex)) {
  db.exec(`ALTER TABLE reports RENAME TO reports_old;`);
  createReportsTable();
  migrateReportsOldTable();
} else if (!hasTextIndex) {
  db.prepare(`ALTER TABLE reports ADD COLUMN text_index TEXT NOT NULL DEFAULT ''`).run();
}

const updatedReportColumns = db.prepare(`PRAGMA table_info(reports)`).all() as TableColumn[];

if (!updatedReportColumns.some((column) => column.name === 'cloud_link')) {
  db.prepare(`ALTER TABLE reports ADD COLUMN cloud_link TEXT`).run();
}

if (!updatedReportColumns.some((column) => column.name === 'added_to_cloud')) {
  db.prepare(`ALTER TABLE reports ADD COLUMN added_to_cloud INTEGER NOT NULL DEFAULT 0`).run();
}

// Clean up again in case a new migration produced reports_old during this execution.
migrateReportsOldTable();

export default db;
