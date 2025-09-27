const WORD_REGEX = /[\p{L}\p{N}]+/gu;

export function normalizeText(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .match(WORD_REGEX)
    ?.filter(Boolean) ?? [];
}

export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

export function cosineSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (!tokensA.length || !tokensB.length) {
    return 0;
  }
  const tfA = termFrequency(tokensA);
  const tfB = termFrequency(tokensB);

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const value of tfA.values()) {
    magnitudeA += value * value;
  }
  for (const value of tfB.values()) {
    magnitudeB += value * value;
  }

  const uniqueTerms = new Set([...tfA.keys(), ...tfB.keys()]);
  for (const term of uniqueTerms) {
    dotProduct += (tfA.get(term) ?? 0) * (tfB.get(term) ?? 0);
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / Math.sqrt(magnitudeA * magnitudeB);
}
