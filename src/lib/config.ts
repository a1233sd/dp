import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const storageDir = resolve(process.env.REPORT_STORAGE_DIR || resolve(process.cwd(), 'storage'));
const databaseDir = resolve(process.cwd(), 'data');

if (!existsSync(databaseDir)) {
  mkdirSync(databaseDir, { recursive: true });
}

if (!existsSync(storageDir)) {
  mkdirSync(storageDir, { recursive: true });
}

export const config = {
  storageDir,
  databasePath: resolve(databaseDir, 'reports.sqlite'),
};
