import crypto from "node:crypto";
import type { ChannelAdapter, ChannelMessage, ChannelResponse } from "../types";

interface IntercomWebhook {
  type: string;
  topic: string;
  data: {
    item: {
      type: string;
      id: string;
      conversation_parts?: {
        conversation_parts: Array<{
          id: string;
          part_type: string;
          body: string;
          author: { type: string; id: string; name?: string };
          created_at: number;
        }>;
      };
      user?: { id: string; name?: string; email?: string };
      source?: { body?: string; author?: { id: string; name?: string } };
    };
  };
}

export class IntercomAdapter implements ChannelAdapter {
  channelType = "intercom" as const;

  constructor(
    private apiKey: string,
    private webhookSecret?: string,
  ) {}

  parseIncoming(raw: unknown): ChannelMessage | null {
    const webhook = raw as IntercomWebhook;
    const item = webhook.data?.item;
    if (!item) return null;

    // Handle new conversation
    if (webhook.topic === "conversation.user.created" && item.source?.body) {
      return {
        channelType: "intercom",
        externalId: item.id,
        visitorExternalId: item.user?.id || item.source.author?.id || "unknown",
        visitorName: item.user?.name || item.source.author?.name,
        content: this.stripHtml(item.source.body),
        timestamp: new Date().toISOString(),
        metadata: { conversationId: item.id, topic: webhook.topic },
      };
    }

    // Handle reply
    if (webhook.topic === "conversation.user.replied") {
      const parts = item.conversation_parts?.conversation_parts || [];
      const latest = parts[parts.length - 1];
      if (!latest || latest.author.type !== "user") return null;

      return {
        channelType: "intercom",
        externalId: latest.id,
        visitorExternalId: latest.author.id,
        visitorName: latest.author.name,
        content: this.stripHtml(latest.body),
        timestamp: new Date(latest.created_at * 1000).toISOString(),
        metadata: { conversationId: item.id, topic: webhook.topic },
      };
    }

    return null;
  }

  formatOutgoing(response: ChannelResponse): {
    body: string;
    message_type: string;
  } {
    return { body: response.content, message_type: "comment" };
  }

  validateWebhook(headers: Record<string, string>, body: string): boolean {
    const hubSignature = headers["x-hub-signature"];
    if (!hubSignature) return false;
    if (!this.webhookSecret) return true; // presence-only check when no secret configured

    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", this.webhookSecret)
        .update(body)
        .digest("hex");
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(hubSignature);
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  async replyToConversation(
    conversationId: string,
    body: string,
  ): Promise<void> {
    const resp = await fetch(
      `https://api.intercom.io/conversations/${conversationId}/reply`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          message_type: "comment",
          type: "admin",
          body,
        }),
      },
    );
    if (!resp.ok) throw new Error(`Intercom API error: ${resp.status}`);
  }
}
