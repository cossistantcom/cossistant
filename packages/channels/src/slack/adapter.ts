import crypto from "node:crypto";
import type { ChannelAdapter, ChannelMessage, ChannelResponse } from "../types";

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    user: string;
    text?: string;
    channel: string;
    ts: string;
    thread_ts?: string;
    files?: Array<{ url_private: string; mimetype: string; name: string }>;
  };
  team_id?: string;
}

export class SlackAdapter implements ChannelAdapter {
  channelType = "slack" as const;

  constructor(
    private botToken: string,
    private signingSecret: string,
  ) {}

  parseIncoming(raw: unknown): ChannelMessage | null {
    const event = raw as SlackEvent;
    if (event.type === "url_verification") return null; // Challenge response
    if (!event.event || event.event.type !== "message") return null;
    if (!event.event.text) return null;

    return {
      channelType: "slack",
      externalId: event.event.ts,
      visitorExternalId: event.event.user,
      content: event.event.text,
      attachments: event.event.files?.map((f) => ({
        url: f.url_private,
        type: f.mimetype,
        name: f.name,
      })),
      timestamp: new Date(parseFloat(event.event.ts) * 1000).toISOString(),
      metadata: {
        channelId: event.event.channel,
        threadTs: event.event.thread_ts,
        teamId: event.team_id,
      },
    };
  }

  formatOutgoing(response: ChannelResponse): { text: string } {
    return { text: response.content };
  }

  validateWebhook(headers: Record<string, string>, body: string): boolean {
    const timestamp = headers["x-slack-request-timestamp"];
    const signature = headers["x-slack-signature"];
    if (!timestamp || !signature) return false;

    // Reject requests older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = crypto
      .createHmac("sha256", this.signingSecret)
      .update(sigBasestring)
      .digest("hex");
    const expectedSignature = `v0=${hmac}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  async sendMessage(
    channel: string,
    text: string,
    threadTs?: string,
  ): Promise<void> {
    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text, thread_ts: threadTs }),
    });
    if (!resp.ok) throw new Error(`Slack API error: ${resp.status}`);
  }
}
