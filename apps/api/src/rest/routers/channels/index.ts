import { Hono } from "hono";

export const channelsRouter = new Hono();

// Telegram webhook
channelsRouter.post("/telegram/webhook", async (c) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ error: "Telegram not configured" }, 503);

  try {
    const { TelegramAdapter } = await import("@plasma/channels");
    const adapter = new TelegramAdapter(token);
    const body = await c.req.json();
    const message = adapter.parseIncoming(body);

    if (!message) return c.json({ ok: true }); // Ignore non-message updates

    // TODO: Queue for AI pipeline via QStash
    // For now, echo back that we received it
    console.log(
      `[telegram] Received from ${message.visitorExternalId}: ${message.content}`,
    );

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

  try {
    const body = await c.req.json();

    // Handle Discord PING verification
    if (body.type === 1) {
      return c.json({ type: 1 });
    }

    const { DiscordAdapter } = await import("@plasma/channels");
    const adapter = new DiscordAdapter(botToken, publicKey);
    const message = adapter.parseIncoming(body);

    if (!message) {
      return c.json({
        type: 4,
        data: { content: "I didn't understand that command." },
      });
    }

    // TODO: Queue for AI pipeline
    console.log(
      `[discord] Received from ${message.visitorExternalId}: ${message.content}`,
    );

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

  try {
    const rawBody = await c.req.text();
    const body = JSON.parse(rawBody);

    // Handle Slack URL verification challenge
    if (body.type === "url_verification") {
      return c.json({ challenge: body.challenge });
    }

    const { SlackAdapter } = await import("@plasma/channels");
    const adapter = new SlackAdapter(botToken, signingSecret);

    // Validate webhook signature
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });
    if (signingSecret && !adapter.validateWebhook(headers, rawBody)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const message = adapter.parseIncoming(body);
    if (!message) return c.json({ ok: true });

    // TODO: Queue for AI pipeline
    console.log(
      `[slack] Received from ${message.visitorExternalId}: ${message.content}`,
    );

    return c.json({ ok: true });
  } catch (err) {
    console.error("[slack] Webhook error:", err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

// Intercom webhook
channelsRouter.post("/intercom/webhook", async (c) => {
  const apiKey = process.env.INTERCOM_API_KEY || "";
  if (!apiKey) return c.json({ error: "Intercom not configured" }, 503);

  try {
    const body = await c.req.json();

    const { IntercomAdapter } = await import("@plasma/channels");
    const adapter = new IntercomAdapter(apiKey);
    const message = adapter.parseIncoming(body);

    if (!message) return c.json({ ok: true });

    // TODO: Queue for AI pipeline
    console.log(
      `[intercom] Received from ${message.visitorExternalId}: ${message.content}`,
    );

    return c.json({ ok: true });
  } catch (err) {
    console.error("[intercom] Webhook error:", err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

// Channel health
channelsRouter.get("/health", async (c) => {
  return c.json({
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    discord: !!process.env.DISCORD_BOT_TOKEN,
    slack: !!process.env.SLACK_BOT_TOKEN,
    intercom: !!process.env.INTERCOM_API_KEY,
  });
});
