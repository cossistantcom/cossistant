export interface Dossier {
  id: string;
  organizationId: string;
  visitorId: string;
  contactId?: string | null;
  content: string;
  tokenCount: number;
  lastInteractionAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DossierUpdate {
  conversationSummary: string;
  sentiment: string;
  keyTopics: string[];
  resolution?: string;
}
