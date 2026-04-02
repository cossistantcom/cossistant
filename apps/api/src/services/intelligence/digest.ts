import type { DigestEntry } from "./types";

interface ConversationStats {
  status: string;
  sentiment: string | null;
  resolutionTime: number | null;
  escalatedAt: string | null;
  resolvedByAiAgentId: string | null;
  createdAt: string;
}

export function generateDigest(
  conversations: ConversationStats[],
  period: string,
): DigestEntry {
  const totalConversations = conversations.length;
  const aiResolved = conversations.filter((c) => c.resolvedByAiAgentId).length;
  const escalated = conversations.filter((c) => c.escalatedAt).length;

  const resolutionTimes = conversations
    .filter((c) => c.resolutionTime != null)
    .map((c) => c.resolutionTime!);
  const avgResolutionTime =
    resolutionTimes.length > 0
      ? Math.round(
          resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length,
        )
      : 0;

  const sentimentBreakdown: Record<string, number> = {};
  for (const c of conversations) {
    const key = c.sentiment || "unknown";
    sentimentBreakdown[key] = (sentimentBreakdown[key] || 0) + 1;
  }

  return {
    period,
    totalConversations,
    aiResolvedCount: aiResolved,
    humanEscalatedCount: escalated,
    averageResolutionTimeSeconds: avgResolutionTime,
    topIssues: [], // Populated by topic extraction (future)
    sentimentBreakdown,
    newFaqSuggestions: 0, // Populated by knowledge gap system
  };
}
