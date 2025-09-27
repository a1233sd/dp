import { describe, expect, it } from 'vitest';
import { cosineSimilarity, normalizeText, tokenize } from './text';

describe('text helpers', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeText(' Привет\nМИР ')).toBe('привет мир');
  });

  it('tokenizes alphanumeric words', () => {
    expect(tokenize('Lab #1: Интеграл!')).toEqual(['lab', '1', 'интеграл']);
  });

  it('computes cosine similarity', () => {
    const a = 'Лабораторная работа по информатике';
    const b = 'Отчет по лабораторной работе информатики';
    const c = 'Совсем другой текст';

    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.2);
    expect(cosineSimilarity(a, c)).toBeLessThan(0.1);
  });
});
