import type { VipCustomer } from "./types";

interface ConversationData {
  visitorId: string;
  messageCount: number;
  sentiment: string | null;
  createdAt: string;
}

interface VisitorData {
  id: string;
  name?: string;
  email?: string;
}

export function calculateVipScore(
  conversationCount: number,
  totalMessages: number,
  avgSentiment: number,
  daysSinceFirst: number,
): number {
  // Weighted score: frequency * engagement * loyalty
  const frequency = Math.min(conversationCount / 10, 1) * 30;
  const engagement = Math.min(totalMessages / 50, 1) * 25;
  const sentiment = ((avgSentiment + 1) / 2) * 20; // Normalize -1..1 to 0..1
  const loyalty = Math.min(daysSinceFirst / 90, 1) * 25;

  return Math.round(frequency + engagement + sentiment + loyalty);
}

const SENTIMENT_MAP: Record<string, number> = {
  positive: 1,
  neutral: 0,
  negative: -1,
  frustrated: -0.8,
  angry: -1,
};

export function rankVipCustomers(
  conversations: ConversationData[],
  visitors: Map<string, VisitorData>,
): VipCustomer[] {
  const grouped = new Map<string, ConversationData[]>();

  for (const conv of conversations) {
    const existing = grouped.get(conv.visitorId) || [];
    existing.push(conv);
    grouped.set(conv.visitorId, existing);
  }

  const results: VipCustomer[] = [];

  for (const [visitorId, convs] of grouped) {
    const visitor = visitors.get(visitorId);
    const totalMessages = convs.reduce((sum, c) => sum + c.messageCount, 0);
    const sentiments = convs
      .filter((c) => c.sentiment)
      .map((c) => SENTIMENT_MAP[c.sentiment!] ?? 0);
    const avgSentiment =
      sentiments.length > 0
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
        : 0;

    const firstConv = convs.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )[0];
    const daysSinceFirst = firstConv
      ? (Date.now() - new Date(firstConv.createdAt).getTime()) /
        (1000 * 60 * 60 * 24)
      : 0;

    const lastConv = convs.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];

    results.push({
      visitorId,
      contactId: undefined,
      name: visitor?.name,
      email: visitor?.email,
      conversationCount: convs.length,
      totalMessages,
      averageSentiment: avgSentiment,
      lastInteractionAt: lastConv?.createdAt || "",
      topTopics: [],
      vipScore: calculateVipScore(
        convs.length,
        totalMessages,
        avgSentiment,
        daysSinceFirst,
      ),
    });
  }

  return results.sort((a, b) => b.vipScore - a.vipScore);
}
