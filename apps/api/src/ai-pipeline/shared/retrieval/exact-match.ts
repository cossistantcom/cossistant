import type { RetrievalResult } from "./types";

// Simple Levenshtein distance implementation
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1,
            );
    }
  }
  return matrix[b.length][a.length];
}

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export function findExactMatch(
  query: string,
  faqEntries: FaqEntry[],
  threshold: number = 3,
): RetrievalResult | null {
  const start = performance.now();
  const normalizedQuery = query.toLowerCase().trim();

  let bestMatch: FaqEntry | null = null;
  let bestDistance = Infinity;

  for (const entry of faqEntries) {
    const distance = levenshtein(
      normalizedQuery,
      entry.question.toLowerCase().trim(),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = entry;
    }
  }

  if (bestMatch && bestDistance <= threshold) {
    return {
      tier: "exact_match",
      content: bestMatch.answer,
      confidence: 1.0 - bestDistance / Math.max(normalizedQuery.length, 1),
      latencyMs: performance.now() - start,
      metadata: { faqId: bestMatch.id, levenshteinDistance: bestDistance },
    };
  }

  return null;
}
