import type { RetrievalResult } from "./types";

// Interface for Redis-backed semantic cache
export interface SemanticCacheStore {
  get(key: string): Promise<{
    content: string;
    embedding: number[];
    similarity: number;
  } | null>;
  set(
    key: string,
    content: string,
    embedding: number[],
    ttlSeconds?: number,
  ): Promise<void>;
}

// Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const norm = Math.sqrt(normA) * Math.sqrt(normB);
  if (norm === 0) return 0;
  return dotProduct / norm;
}

export async function checkSemanticCache(
  queryEmbedding: number[],
  cache: SemanticCacheStore,
  threshold: number = 0.92,
  query: string,
): Promise<RetrievalResult | null> {
  const start = performance.now();

  const key = query.toLowerCase().trim();
  const cached = await cache.get(key);
  if (!cached) return null;

  const similarity = cosineSimilarity(queryEmbedding, cached.embedding);
  if (similarity >= threshold) {
    return {
      tier: "semantic_cache",
      content: cached.content,
      confidence: similarity,
      latencyMs: performance.now() - start,
      metadata: { cacheHit: true, similarity },
    };
  }

  return null;
}
