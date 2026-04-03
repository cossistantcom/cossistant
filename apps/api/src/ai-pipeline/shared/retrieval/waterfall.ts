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
  try {
    const exactMatch = findExactMatch(
      ctx.query,
      ctx.faqEntries,
      config.exactMatchThreshold,
    );
    if (exactMatch) return exactMatch;
  } catch (err) {
    console.warn("[waterfall] L0 exact match failed, falling through:", err);
  }

  // L1: Semantic Cache (~8ms)
  if (ctx.queryEmbedding && ctx.semanticCache) {
    try {
      const cached = await checkSemanticCache(
        ctx.queryEmbedding,
        ctx.semanticCache,
        config.semanticCacheThreshold,
        ctx.query,
      );
      if (cached) return cached;
    } catch (err) {
      console.warn(
        "[waterfall] L1 semantic cache failed, falling through:",
        err,
      );
    }
  }

  // L2: Vector Search (~15ms)
  const ragContext: string[] = [];
  if (ctx.queryEmbedding && ctx.vectorSearch) {
    try {
      const vectorResult = await ctx.vectorSearch(
        ctx.queryEmbedding,
        config.vectorSearchThreshold,
      );
      if (vectorResult) {
        if (vectorResult.confidence >= config.vectorSearchThreshold) {
          return vectorResult;
        }
        // Below threshold but has content — carry forward to RAG
        ragContext.push(vectorResult.content);
      }
    } catch (err) {
      console.warn(
        "[waterfall] L2 vector search failed, falling through:",
        err,
      );
    }
  }

  // L3: RAG Generation (~500-1500ms)
  if (ctx.ragGenerate) {
    try {
      const ragResult = await ctx.ragGenerate(ctx.query, ragContext);
      if (ragResult && ragResult.confidence >= config.ragConfidenceThreshold) {
        // Write back to semantic cache for future hits
        if (ctx.semanticCache && ctx.queryEmbedding) {
          try {
            await ctx.semanticCache.set(
              ctx.query,
              ragResult.content,
              ctx.queryEmbedding,
            );
          } catch {}
        }
        return ragResult;
      }
    } catch (err) {
      console.warn(
        "[waterfall] L3 RAG generation failed, falling through:",
        err,
      );
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
