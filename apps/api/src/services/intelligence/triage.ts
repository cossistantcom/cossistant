import type { TriageItem } from "./types";

interface EscalatedConversation {
  id: string;
  visitorId: string;
  visitorName?: string;
  sentiment: string | null;
  escalationReason: string | null;
  escalatedAt: string;
  lastMessageText?: string;
}

export function buildTriageQueue(
  escalated: EscalatedConversation[],
  now: Date = new Date(),
): TriageItem[] {
  return escalated
    .map((conv) => {
      const waitMinutes = Math.round(
        (now.getTime() - new Date(conv.escalatedAt).getTime()) / (1000 * 60),
      );

      // Urgency score: wait time + sentiment severity
      const sentimentPenalty =
        conv.sentiment === "angry"
          ? 30
          : conv.sentiment === "frustrated"
            ? 20
            : conv.sentiment === "negative"
              ? 10
              : 0;
      const urgencyScore = Math.min(waitMinutes + sentimentPenalty, 100);

      return {
        conversationId: conv.id,
        visitorId: conv.visitorId,
        visitorName: conv.visitorName,
        urgencyScore,
        waitTimeMinutes: waitMinutes,
        sentiment: conv.sentiment || "unknown",
        escalationReason: conv.escalationReason || undefined,
        lastMessagePreview: (conv.lastMessageText || "").slice(0, 100),
        createdAt: conv.escalatedAt,
      };
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore);
}
