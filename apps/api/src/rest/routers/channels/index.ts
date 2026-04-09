import { db } from "@api/db";
import { ingestInboundChannelMessage } from "@api/services/channel-ingestion";
import { Hono } from "hono";

export const channelsRouter = new Hono();

function getChannelTargetConfig() {
  const websiteId = process.env.CHANNELS_WEBSITE_ID?.trim() || "";
  const organizationId = process.env.CHANNELS_ORGANIZATION_ID?.trim() || "";

  if (!(websiteId && organizationId)) {
    return null;
  }

  return {
    websiteId,
    organizationId,
  };
}

// Telegram webhook
channelsRouter.post("/telegram/webhook", async (c) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ error: "Telegram not configured" }, 503);

  const secret = c.req.header("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return c.json({ error: "Telegram webhook secret not configured" }, 503);
  }
  if (expectedSecret && secret !== expectedSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { TelegramAdapter } = await import("@plasma/channels");
    const adapter = new TelegramAdapter(token);
    const body = await c.req.json();
    const message = adapter.parseIncoming(body);

    if (!message) return c.json({ ok: true }); // Ignore non-message updates
    const target = getChannelTargetConfig();
    if (!target) {
      return c.json({ error: "Channel target not configured" }, 503);
    }

    await ingestInboundChannelMessage({
      db,
      target,
      message,
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error("[telegram] Webhook error:", err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

// Discord interactions
channelsRouter.post("/discord/interactions", async (c) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const publicKey = process.env.DISCORD_PUBLIC_KEY || "";
  if (!botToken) return c.json({ error: "Discord not configured" }, 503);
  if (!publicKey) {
    return c.json({ error: "Discord public key not configured" }, 503);
  }

  try {
    const rawBody = await c.req.text();
    const body = JSON.parse(rawBody);

    const { DiscordAdapter } = await import("@plasma/channels");
    const adapter = new DiscordAdapter(botToken, publicKey);

    // Validate Ed25519 signature before any response (including PING)
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });
    if (publicKey && !adapter.validateWebhook(headers, rawBody)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    // Handle Discord PING verification
    if (body.type === 1) {
      return c.json({ type: 1 });
    }

    const message = adapter.parseIncoming(body);

    if (!message) {
      return c.json({
        type: 4,
        data: { content: "I didn't understand that command." },
      });
    }
    const target = getChannelTargetConfig();
    if (!target) {
      return c.json({ error: "Channel target not configured" }, 503);
    }

    await ingestInboundChannelMessage({
      db,
      target,
      message,
    });

    return c.json(
      adapter.formatOutgoing({
        content: "Got it! I'm processing your request...",
      }),
    );
  } catch (err) {
    console.error("[discord] Webhook error:", err);
    return c.json({ type: 4, data: { content: "Something went wrong." } });
  }
});

// Slack events
channelsRouter.post("/slack/events", async (c) => {
  const botToken = process.env.SLACK_BOT_TOKEN || "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET || "";
  if (!botToken) return c.json({ error: "Slack not configured" }, 503);
  if (!signingSecret) {
    return c.json({ error: "Slack signing secret not configured" }, 503);
  }

  try {
    const rawBody = await c.req.text();
    const body = JSON.parse(rawBody);

    const { SlackAdapter } = await import("@plasma/channels");
    const adapter = new SlackAdapter(botToken, signingSecret);

    // Validate webhook signature before handling any event type
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });
    if (signingSecret && !adapter.validateWebhook(headers, rawBody)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    // Handle Slack URL verification challenge
    if (body.type === "url_verification") {
      return c.json({ challenge: body.challenge });
    }

    const message = adapter.parseIncoming(body);
    if (!message) return c.json({ ok: true });
    const target = getChannelTargetConfig();
    if (!target) {
      return c.json({ error: "Channel target not configured" }, 503);
    }

    await ingestInboundChannelMessage({
      db,
      target,
      message,
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error("[slack] Webhook error:", err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

// Intercom webhook
channelsRouter.post("/intercom/webhook", async (c) => {
  const apiKey = process.env.INTERCOM_API_KEY || "";
  const webhookSecret = process.env.INTERCOM_WEBHOOK_SECRET;
  if (!apiKey) return c.json({ error: "Intercom not configured" }, 503);
  if (!webhookSecret) {
    return c.json({ error: "Intercom webhook secret not configured" }, 503);
  }

  try {
    const rawBody = await c.req.text();
    const body = JSON.parse(rawBody);

    const { IntercomAdapter } = await import("@plasma/channels");
    const adapter = new IntercomAdapter(apiKey, webhookSecret);

    // Validate HMAC signature before processing body
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });
    if (!adapter.validateWebhook(headers, rawBody)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const message = adapter.parseIncoming(body);

    if (!message) return c.json({ ok: true });
    const target = getChannelTargetConfig();
    if (!target) {
      return c.json({ error: "Channel target not configured" }, 503);
    }

    await ingestInboundChannelMessage({
      db,
      target,
      message,
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error("[intercom] Webhook error:", err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

// Channel health
channelsRouter.get("/health", async (c) => {
  return c.json({ status: "ok" });
});
