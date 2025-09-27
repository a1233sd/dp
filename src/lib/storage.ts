import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from './config';

export function persistReportFile(buffer: Buffer, originalName: string): {
  id: string;
  storedName: string;
  absolutePath: string;
} {
  const id = randomUUID();
  const storedName = `${id}.pdf`;
  const absolutePath = resolve(config.storageDir, storedName);
  writeFileSync(absolutePath, buffer);
  return { id, storedName, absolutePath };
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
