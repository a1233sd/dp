import { existsSync, rmSync } from 'fs';
import { config } from '../src/lib/config';

const databaseFiles = [config.databasePath, `${config.databasePath}-wal`, `${config.databasePath}-shm`];

export const resetDatabase = () => {
  let removedFiles = 0;

  for (const file of databaseFiles) {
    if (!file) {
      continue;
    }

    if (!existsSync(file)) {
      continue;
    }

    rmSync(file);
    removedFiles += 1;
  }

  if (removedFiles > 0) {
    console.log(`Removed ${removedFiles} database file${removedFiles === 1 ? '' : 's'}.`);
  }
};

try {
  resetDatabase();
} catch (error) {
  console.error('Failed to reset database before startup.');
  console.error(error);
  process.exit(1);
}
