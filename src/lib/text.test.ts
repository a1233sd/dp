import { describe, expect, it } from 'vitest';
import { cosineSimilarity, normalizeText, tokenize, plagiarismSimilarity, trigramSimilarity } from './text';

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

  it('computes trigram similarity that ignores punctuation', () => {
    const a = 'Архитектура сети SDH: базовые топологии';
    const b = 'Архитектура сети SDH — базовые топологии';
    const c = 'Описание другой архитектуры';

    expect(trigramSimilarity(a, b)).toBeGreaterThan(0.8);
    expect(trigramSimilarity(a, c)).toBeLessThan(0.4);
  });

  it('combines lexical and structural similarity for plagiarism detection', () => {
    const reference = 'Архитектура сети SDH включает кольцо, точка-точка и ячеистую топологию.';
    const suspect = 'Сеть SDH характеризуется топологиями "кольцо", "точка-точка" и "ячеистая".';
    const unrelated = 'Совершенно не связанный текст о биологии и химии.';

    expect(plagiarismSimilarity(reference, suspect)).toBeGreaterThan(0.55);
    expect(plagiarismSimilarity(reference, unrelated)).toBeLessThan(0.2);
  });
});
