import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const storageDir = resolve(process.env.REPORT_STORAGE_DIR || resolve(process.cwd(), 'storage'));
const textIndexDir = resolve(storageDir, 'text-indexes');
const databaseDir = resolve(process.cwd(), 'data');

if (!existsSync(databaseDir)) {
  mkdirSync(databaseDir, { recursive: true });
}

if (!existsSync(storageDir)) {
  mkdirSync(storageDir, { recursive: true });
}

if (!existsSync(textIndexDir)) {
  mkdirSync(textIndexDir, { recursive: true });
}

export const config = {
  storageDir,
  textIndexDir,
  databasePath: resolve(databaseDir, 'reports.sqlite'),
  cloudArchiveLink:
    process.env.CLOUD_ARCHIVE_LINK?.trim() || 'https://disk.yandex.ru/d/JN_BKCimDkzkLw',
};
