export type ChannelType =
  | "telegram"
  | "discord"
  | "slack"
  | "intercom"
  | "widget"
  | "voice";

export interface ChannelMessage {
  channelType: ChannelType;
  externalId: string;
  visitorExternalId: string;
  visitorName?: string;
  content: string;
  attachments?: Array<{ url: string; type: string; name?: string }>;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ChannelResponse {
  content: string;
  attachments?: Array<{ url: string; type: string }>;
}

export interface ChannelAdapter {
  channelType: ChannelType;
  parseIncoming(raw: unknown): ChannelMessage | null;
  formatOutgoing(response: ChannelResponse): unknown;
  validateWebhook(headers: Record<string, string>, body: string): boolean;
}
