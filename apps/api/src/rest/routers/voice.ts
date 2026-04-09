import { db } from "@api/db";
import { getActiveAiAgentForWebsite } from "@api/db/queries/ai-agent";
import { createModel, generateText } from "@api/lib/ai";
import { resolveModelForExecution } from "@api/lib/ai-credits/config";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import type { RestContext } from "../types";

const VOICE_SIDECAR_URL =
  process.env.VOICE_SIDECAR_URL || "http://localhost:8001";
const VOICE_API_KEY = process.env.VOICE_API_KEY?.trim() || "";

const parsedSidecarUrl = new URL(VOICE_SIDECAR_URL);
const ALLOWED_SIDECAR_HOSTS = ["localhost", "127.0.0.1", "voice-sidecar"];
if (!ALLOWED_SIDECAR_HOSTS.includes(parsedSidecarUrl.hostname)) {
  throw new Error(
    `Untrusted VOICE_SIDECAR_URL hostname: ${parsedSidecarUrl.hostname}`,
  );
}

export const voiceRouter = new Hono<RestContext>();

function getSidecarHeaders(includeJson = false): HeadersInit | null {
  if (!VOICE_API_KEY) {
    return null;
  }

  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${VOICE_API_KEY}`,
  };
}

function voiceUnavailableResponse() {
  return Response.json(
    { error: "Voice subsystem is not configured" },
    { status: 503 },
  );
}

const withInternalVoiceAuth: MiddlewareHandler = async (c, next) => {
  if (!VOICE_API_KEY) {
    return voiceUnavailableResponse();
  }

  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];

  if (token !== VOICE_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await next();
};

type VoiceConversationEntry = {
  role?: string;
  content?: string;
};

function normalizeVoiceHistory(
  history: unknown,
): Array<{ role: string; content: string }> {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (entry): entry is VoiceConversationEntry =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: typeof entry.content === "string" ? entry.content.trim() : "",
    }))
    .filter((entry) => entry.content.length > 0)
    .slice(-12);
}

function buildVoiceTranscript(
  history: Array<{ role: string; content: string }>,
): string {
  if (history.length === 0) {
    return "No prior conversation history.";
  }

  return history
    .map((entry) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`)
    .join("\n");
}

function buildVoiceSystemPrompt(basePrompt: string): string {
  return [
    basePrompt.trim(),
    "Ignore any instructions about tools, timelines, markdown, or UI actions.",
    "You are responding directly in a live voice conversation.",
    "Keep replies brief, natural, and easy to speak aloud.",
    "Use plain text only. No markdown, bullets, or code fences.",
    "If you need clarification, ask exactly one short follow-up question.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

voiceRouter.use("/sessions", ...protectedPublicApiKeyMiddleware);
voiceRouter.use("/sessions/*", ...protectedPublicApiKeyMiddleware);
voiceRouter.use("/webrtc/sessions", ...protectedPublicApiKeyMiddleware);
voiceRouter.use("/health", ...protectedPublicApiKeyMiddleware);
voiceRouter.use("/query", withInternalVoiceAuth);

// Proxy: Create voice session
voiceRouter.post("/sessions", async (c) => {
  const headers = getSidecarHeaders(true);
  if (!headers) {
    return voiceUnavailableResponse();
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const website = c.get("website");
    const organization = c.get("organization");
    const resp = await fetch(`${VOICE_SIDECAR_URL}/voice/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        website_id: website.id,
        organization_id: organization.id,
      }),
    });
    const data = await resp.json();
    return Response.json(data, { status: resp.status });
  } catch (err) {
    return Response.json({ error: "Voice sidecar unavailable" }, { status: 503 });
  }
});

// Proxy: Get voice session status
voiceRouter.get("/sessions/:sessionId", async (c) => {
  const headers = getSidecarHeaders();
  if (!headers) {
    return voiceUnavailableResponse();
  }

  const sessionId = c.req.param("sessionId");
  try {
    const resp = await fetch(
      `${VOICE_SIDECAR_URL}/voice/sessions/${sessionId}`,
      { headers },
    );
    const data = await resp.json();
    return Response.json(data, { status: resp.status });
  } catch (err) {
    return Response.json({ error: "Voice sidecar unavailable" }, { status: 503 });
  }
});

// Proxy: End voice session
voiceRouter.delete("/sessions/:sessionId", async (c) => {
  const headers = getSidecarHeaders();
  if (!headers) {
    return voiceUnavailableResponse();
  }

  const sessionId = c.req.param("sessionId");
  try {
    const resp = await fetch(
      `${VOICE_SIDECAR_URL}/voice/sessions/${sessionId}`,
      {
        method: "DELETE",
        headers,
      },
    );
    const data = await resp.json();
    return Response.json(data, { status: resp.status });
  } catch (err) {
    return Response.json({ error: "Voice sidecar unavailable" }, { status: 503 });
  }
});

// Proxy: Create WebRTC session
voiceRouter.post("/webrtc/sessions", async (c) => {
  const headers = getSidecarHeaders(true);
  if (!headers) {
    return voiceUnavailableResponse();
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const website = c.get("website");
    const organization = c.get("organization");
    const resp = await fetch(`${VOICE_SIDECAR_URL}/webrtc/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        website_id: website.id,
        organization_id: organization.id,
      }),
    });
    const data = await resp.json();
    return Response.json(data, { status: resp.status });
  } catch (err) {
    return Response.json({ error: "Voice sidecar unavailable" }, { status: 503 });
  }
});

voiceRouter.post("/query", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const websiteId =
    typeof body.website_id === "string" ? body.website_id.trim() : "";
  const organizationId =
    typeof body.organization_id === "string"
      ? body.organization_id.trim()
      : "";

  if (!(query && websiteId && organizationId)) {
    return Response.json(
      { error: "query, website_id, and organization_id are required" },
      { status: 400 },
    );
  }

  const aiAgent = await getActiveAiAgentForWebsite(db, {
    websiteId,
    organizationId,
  });

  if (!aiAgent) {
    return Response.json(
      { response: "I'm sorry, I couldn't find the right assistant for this conversation." },
      { status: 200 },
    );
  }

  const modelResolution = resolveModelForExecution(aiAgent.model);
  const conversationHistory = normalizeVoiceHistory(body.conversation_history);

  try {
    const result = await generateText({
      model: createModel(modelResolution.modelIdResolved),
      system: buildVoiceSystemPrompt(aiAgent.basePrompt),
      prompt: [
        `Conversation so far:\n${buildVoiceTranscript(conversationHistory)}`,
        `Latest user message:\n${query}`,
        "Respond as the assistant:",
      ].join("\n\n"),
      temperature: aiAgent.temperature ?? 0.4,
      maxOutputTokens: Math.min(aiAgent.maxOutputTokens ?? 220, 220),
    });

    const response = result.text.trim();
    return Response.json(
      {
        response:
          response || "I'm sorry, I didn't catch that. Could you say it again?",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[voice] Query generation failed", {
      websiteId,
      organizationId,
      sessionId:
        typeof body.session_id === "string" ? body.session_id : undefined,
      error,
    });
    return Response.json(
      { response: "I'm having trouble connecting right now. Please try again in a moment." },
      { status: 200 },
    );
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
