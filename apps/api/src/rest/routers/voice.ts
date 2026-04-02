import { Hono } from "hono";

const VOICE_SIDECAR_URL =
  process.env.VOICE_SIDECAR_URL || "http://localhost:8001";

export const voiceRouter = new Hono();

// Proxy: Create voice session
voiceRouter.post("/sessions", async (c) => {
  try {
    const body = await c.req.json();
    const resp = await fetch(`${VOICE_SIDECAR_URL}/voice/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err) {
    return c.json({ error: "Voice sidecar unavailable" }, 503);
  }
});

// Proxy: Get voice session status
voiceRouter.get("/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  try {
    const resp = await fetch(
      `${VOICE_SIDECAR_URL}/voice/sessions/${sessionId}`,
    );
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err) {
    return c.json({ error: "Voice sidecar unavailable" }, 503);
  }
});

// Proxy: End voice session
voiceRouter.delete("/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  try {
    const resp = await fetch(
      `${VOICE_SIDECAR_URL}/voice/sessions/${sessionId}`,
      {
        method: "DELETE",
      },
    );
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err) {
    return c.json({ error: "Voice sidecar unavailable" }, 503);
  }
});

// Proxy: Create WebRTC session
voiceRouter.post("/webrtc/sessions", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const resp = await fetch(`${VOICE_SIDECAR_URL}/webrtc/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err) {
    return c.json({ error: "Voice sidecar unavailable" }, 503);
  }
});

// Health check for voice subsystem
voiceRouter.get("/health", async (c) => {
  try {
    const resp = await fetch(`${VOICE_SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await resp.json();
    return c.json({ voice_sidecar: "healthy", ...data });
  } catch {
    return c.json({ voice_sidecar: "unavailable" }, 503);
  }
});
