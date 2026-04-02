export interface VipCustomer {
  visitorId: string;
  contactId?: string;
  name?: string;
  email?: string;
  conversationCount: number;
  totalMessages: number;
  averageSentiment: number;
  lastInteractionAt: string;
  topTopics: string[];
  vipScore: number;
}

export interface DigestEntry {
  period: string;
  totalConversations: number;
  aiResolvedCount: number;
  humanEscalatedCount: number;
  averageResolutionTimeSeconds: number;
  topIssues: Array<{ topic: string; count: number }>;
  sentimentBreakdown: Record<string, number>;
  newFaqSuggestions: number;
}

export interface TriageItem {
  conversationId: string;
  visitorId: string;
  visitorName?: string;
  urgencyScore: number;
  waitTimeMinutes: number;
  sentiment: string;
  escalationReason?: string;
  lastMessagePreview: string;
  createdAt: string;
}
