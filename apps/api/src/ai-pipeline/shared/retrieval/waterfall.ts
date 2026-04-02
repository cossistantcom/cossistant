import type { FaqEntry } from "./exact-match";
import { findExactMatch } from "./exact-match";
import type { SemanticCacheStore } from "./semantic-cache";
import { checkSemanticCache } from "./semantic-cache";
import type { RetrievalResult, WaterfallConfig } from "./types";
import { DEFAULT_WATERFALL_CONFIG } from "./types";

export interface WaterfallContext {
  query: string;
  queryEmbedding?: number[];
  faqEntries: FaqEntry[];
  semanticCache?: SemanticCacheStore;
  vectorSearch?: (
    embedding: number[],
    threshold: number,
  ) => Promise<RetrievalResult | null>;
  ragGenerate?: (
    query: string,
    context: string[],
  ) => Promise<RetrievalResult | null>;
  config?: Partial<WaterfallConfig>;
}

export async function executeWaterfall(
  ctx: WaterfallContext,
): Promise<RetrievalResult> {
  const config = { ...DEFAULT_WATERFALL_CONFIG, ...ctx.config };

  // L0: Exact Match (~5ms)
  const exactMatch = findExactMatch(
    ctx.query,
    ctx.faqEntries,
    config.exactMatchThreshold,
  );
  if (exactMatch) return exactMatch;

  // L1: Semantic Cache (~8ms)
  if (ctx.queryEmbedding && ctx.semanticCache) {
    const cached = await checkSemanticCache(
      ctx.queryEmbedding,
      ctx.semanticCache,
      config.semanticCacheThreshold,
    );
    if (cached) return cached;
  }

  // L2: Vector Search (~15ms)
  if (ctx.queryEmbedding && ctx.vectorSearch) {
    const vectorResult = await ctx.vectorSearch(
      ctx.queryEmbedding,
      config.vectorSearchThreshold,
    );
    if (
      vectorResult &&
      vectorResult.confidence >= config.vectorSearchThreshold
    ) {
      return vectorResult;
    }
  }

  // L3: RAG Generation (~500-1500ms)
  if (ctx.ragGenerate) {
    const ragResult = await ctx.ragGenerate(ctx.query, []);
    if (ragResult && ragResult.confidence >= config.ragConfidenceThreshold) {
      return ragResult;
    }
  }

  // L4: Escalation
  return {
    tier: "escalation",
    content: "I need to connect you with a team member who can help with this.",
    confidence: 0,
    latencyMs: 0,
    metadata: { reason: "all_tiers_exhausted" },
  };
}
