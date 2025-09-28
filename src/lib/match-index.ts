import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from './config';

type MatchIndex = Record<string, string[]>;

const MATCH_INDEX_FILE = resolve(config.textIndexDir, 'matches.json');

function readIndex(): MatchIndex {
  if (!existsSync(MATCH_INDEX_FILE)) {
    return {};
  }

  try {
    const raw = readFileSync(MATCH_INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const index: MatchIndex = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key !== 'string' || !Array.isArray(value)) {
        continue;
      }
      const unique = Array.from(
        new Set(value.filter((item): item is string => typeof item === 'string'))
      );
      if (unique.length) {
        index[key] = unique.filter((item) => item !== key);
      }
    }
    return index;
  } catch {
    return {};
  }
}

function writeIndex(index: MatchIndex): void {
  const cleaned: MatchIndex = {};
  for (const [key, value] of Object.entries(index)) {
    const unique = Array.from(new Set(value.filter((item) => item !== key)));
    if (unique.length) {
      cleaned[key] = unique;
    }
  }
  writeFileSync(MATCH_INDEX_FILE, JSON.stringify(cleaned, null, 2), 'utf-8');
}

export function getIndexedMatches(reportId: string): string[] {
  const index = readIndex();
  return index[reportId] ? [...index[reportId]] : [];
}

export function updateMatchIndex(reportId: string, matches: string[]): void {
  const index = readIndex();
  const uniqueMatches = Array.from(
    new Set(matches.filter((matchId) => matchId && matchId !== reportId))
  );
  for (const [peerId, peerMatches] of Object.entries(index)) {
    if (peerId === reportId || !peerMatches.length) {
      continue;
    }
    const filtered = peerMatches.filter((item) => item !== reportId && item !== peerId);
    if (filtered.length !== peerMatches.length) {
      if (filtered.length) {
        index[peerId] = Array.from(new Set(filtered));
      } else {
        delete index[peerId];
      }
    }
  }

  if (uniqueMatches.length) {
    index[reportId] = uniqueMatches;
    for (const matchId of uniqueMatches) {
      const peerSet = new Set(index[matchId] ?? []);
      peerSet.add(reportId);
      peerSet.delete(matchId);
      index[matchId] = Array.from(peerSet);
    }
  } else {
    delete index[reportId];
  }

  writeIndex(index);
}

export function removeReportFromMatchIndex(reportId: string): void {
  const index = readIndex();
  if (!Object.keys(index).length) {
    return;
  }

  let changed = false;

  if (index[reportId]) {
    delete index[reportId];
    changed = true;
  }

  for (const [key, value] of Object.entries(index)) {
    if (!value.length) {
      continue;
    }
    const filtered = value.filter((item) => item !== reportId && item !== key);
    if (filtered.length !== value.length) {
      changed = true;
      if (filtered.length) {
        index[key] = filtered;
      } else {
        delete index[key];
      }
    }
  }

  if (changed) {
    writeIndex(index);
  }
}

export function resetMatchIndex(): void {
  writeFileSync(MATCH_INDEX_FILE, JSON.stringify({}, null, 2), 'utf-8');
}

