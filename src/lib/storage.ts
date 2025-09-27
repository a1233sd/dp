import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
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
