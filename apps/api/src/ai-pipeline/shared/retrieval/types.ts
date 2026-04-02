export type RetrievalTier =
  | "exact_match"
  | "semantic_cache"
  | "vector_search"
  | "rag_generation"
  | "escalation";

export interface RetrievalResult {
  tier: RetrievalTier;
  content: string;
  confidence: number;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}

export interface WaterfallConfig {
  exactMatchThreshold: number; // Levenshtein distance, default 3
  semanticCacheThreshold: number; // Cosine similarity, default 0.92
  vectorSearchThreshold: number; // Cosine similarity, default 0.70
  ragConfidenceThreshold: number; // Minimum confidence for RAG, default 0.70
  semanticCacheTtlSeconds: number; // Cache TTL, default 3600
}

export const DEFAULT_WATERFALL_CONFIG: WaterfallConfig = {
  exactMatchThreshold: 3,
  semanticCacheThreshold: 0.92,
  vectorSearchThreshold: 0.7,
  ragConfidenceThreshold: 0.7,
  semanticCacheTtlSeconds: 3600,
};
