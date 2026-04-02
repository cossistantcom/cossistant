import crypto from "node:crypto";
import type { ChannelAdapter, ChannelMessage, ChannelResponse } from "../types";

interface DiscordInteraction {
  type: number; // 1=PING, 2=APPLICATION_COMMAND, 3=MESSAGE_COMPONENT
  id: string;
  token: string;
  data?: { name?: string; options?: Array<{ name: string; value: string }> };
  member?: { user: { id: string; username: string; global_name?: string } };
  user?: { id: string; username: string; global_name?: string };
  channel_id: string;
  guild_id?: string;
}

export class DiscordAdapter implements ChannelAdapter {
  channelType = "discord" as const;

  constructor(
    private botToken: string,
    private publicKey: string,
  ) {}

  parseIncoming(raw: unknown): ChannelMessage | null {
    const interaction = raw as DiscordInteraction;
    if (interaction.type === 1) return null; // PING — handled separately

    const user = interaction.member?.user || interaction.user;
    const content = interaction.data?.options?.[0]?.value || "";

    if (!content) return null;

    return {
      channelType: "discord",
      externalId: interaction.id,
      visitorExternalId: user?.id || "unknown",
      visitorName: user?.global_name || user?.username,
      content,
      timestamp: new Date().toISOString(),
      metadata: {
        channelId: interaction.channel_id,
        guildId: interaction.guild_id,
        interactionToken: interaction.token,
      },
    };
  }

  formatOutgoing(response: ChannelResponse): {
    type: number;
    data: { content: string };
  } {
    return { type: 4, data: { content: response.content } };
  }

  validateWebhook(headers: Record<string, string>, body: string): boolean {
    const signature = headers["x-signature-ed25519"];
    const timestamp = headers["x-signature-timestamp"];
    if (!signature || !timestamp) return false;

    try {
      const publicKeyBytes = Buffer.from(this.publicKey, "hex");
      // DER-encode the raw 32-byte Ed25519 public key
      // SubjectPublicKeyInfo prefix for Ed25519: 302a300506032b6570032100
      const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
      const derKey = Buffer.concat([derPrefix, publicKeyBytes]);
      const keyObject = crypto.createPublicKey({
        key: derKey,
        format: "der",
        type: "spki",
      });
      const message = Buffer.from(timestamp + body);
      const sig = Buffer.from(signature, "hex");
      return crypto.verify(null, message, keyObject, sig);
    } catch {
      return false;
    }
  }
}
