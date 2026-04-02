import { timingSafeEqual } from "node:crypto";
import type { ChannelAdapter, ChannelMessage, ChannelResponse } from "../types";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: { id: number; type: string };
    text?: string;
    photo?: Array<{ file_id: string }>;
    document?: { file_id: string; file_name?: string };
    date: number;
  };
}

export class TelegramAdapter implements ChannelAdapter {
  channelType = "telegram" as const;

  constructor(
    private botToken: string,
    private webhookSecret?: string,
  ) {}

  parseIncoming(raw: unknown): ChannelMessage | null {
    const update = raw as TelegramUpdate;
    if (!update.message?.text) return null;

    const from = update.message.from;
    return {
      channelType: "telegram",
      externalId: String(update.message.message_id),
      visitorExternalId: String(from?.id || update.message.chat.id),
      visitorName:
        [from?.first_name, from?.last_name].filter(Boolean).join(" ") ||
        undefined,
      content: update.message.text,
      timestamp: new Date(update.message.date * 1000).toISOString(),
      metadata: {
        chatId: update.message.chat.id,
        chatType: update.message.chat.type,
      },
    };
  }

  formatOutgoing(response: ChannelResponse): { method: string; text: string } {
    return { method: "sendMessage", text: response.content };
  }

  validateWebhook(headers: Record<string, string>, _body: string): boolean {
    if (!this.webhookSecret) return true;
    const token = headers["x-telegram-bot-api-secret-token"];
    if (!token) return false;
    const expected = Buffer.from(this.webhookSecret);
    const received = Buffer.from(token);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    const resp = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      },
    );
    if (!resp.ok) throw new Error(`Telegram API error: ${resp.status}`);
  }
}
