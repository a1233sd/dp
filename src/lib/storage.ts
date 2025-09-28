import { randomUUID } from 'crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from './config';

export function generateReportId(): string {
  return randomUUID();
}

export function persistReportText(id: string, text: string): {
  index: string;
  absolutePath: string;
} {
  const fileName = `${id}.txt`;
  const absolutePath = resolve(config.textIndexDir, fileName);
  writeFileSync(absolutePath, text, 'utf-8');
  return { index: fileName, absolutePath };
}

export function readReportText(index: string): string {
  const absolutePath = resolve(config.textIndexDir, index);
  return readFileSync(absolutePath, 'utf-8');
}

function safeUnlink(path: string) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

export function removeReportText(index: string): void {
  const absolutePath = resolve(config.textIndexDir, index);
  safeUnlink(absolutePath);
}
