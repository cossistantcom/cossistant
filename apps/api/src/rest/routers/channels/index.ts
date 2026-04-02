import { Hono } from "hono";

export const channelsRouter = new Hono();

// Telegram webhook (Phase 4)
channelsRouter.post("/telegram/webhook", async (c) => {
  return c.json({ status: "not_implemented" }, 501);
});

// Discord interactions (Phase 4)
channelsRouter.post("/discord/interactions", async (c) => {
  return c.json({ status: "not_implemented" }, 501);
});

// Slack events (Phase 4)
channelsRouter.post("/slack/events", async (c) => {
  return c.json({ status: "not_implemented" }, 501);
});

// Intercom webhook (Phase 4)
channelsRouter.post("/intercom/webhook", async (c) => {
  return c.json({ status: "not_implemented" }, 501);
});
