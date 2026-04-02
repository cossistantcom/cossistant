/**
 * Append-only audit logger.
 * Every pipeline execution, guard trigger, admin action, and channel event gets logged.
 */

export type AuditActorType = "user" | "ai_agent" | "visitor" | "system";

export interface AuditEvent {
  organizationId: string;
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

// In-memory buffer for fire-and-forget logging
const BUFFER: AuditEvent[] = [];
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 100;

let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushCallback: ((events: AuditEvent[]) => Promise<void>) | null = null;

export function initAuditLogger(
  onFlush: (events: AuditEvent[]) => Promise<void>,
): void {
  flushCallback = onFlush;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);
}

export function logAuditEvent(event: AuditEvent): void {
  BUFFER.push(event);
  if (BUFFER.length >= MAX_BUFFER_SIZE) {
    flushBuffer();
  }
}

async function flushBuffer(): Promise<void> {
  if (BUFFER.length === 0 || !flushCallback) return;
  const batch = BUFFER.splice(0, BUFFER.length);
  try {
    await flushCallback(batch);
  } catch (err) {
    // Re-queue failed events (up to limit)
    if (BUFFER.length < MAX_BUFFER_SIZE * 2) {
      BUFFER.push(...batch);
    }
    console.error("[audit] Flush failed:", err);
  }
}

export async function shutdownAuditLogger(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushBuffer();
}

// Convenience helpers for common audit events
export const AuditActions = {
  // Pipeline events
  pipelineStarted: (orgId: string, conversationId: string, agentId: string) =>
    logAuditEvent({
      organizationId: orgId,
      actorType: "ai_agent",
      actorId: agentId,
      action: "pipeline.started",
      targetType: "conversation",
      targetId: conversationId,
    }),

  pipelineCompleted: (
    orgId: string,
    conversationId: string,
    agentId: string,
    metrics?: Record<string, unknown>,
  ) =>
    logAuditEvent({
      organizationId: orgId,
      actorType: "ai_agent",
      actorId: agentId,
      action: "pipeline.completed",
      targetType: "conversation",
      targetId: conversationId,
      metadata: metrics,
    }),

  // Guard events
  guardTriggered: (
    orgId: string,
    guardType: string,
    threatLevel: string,
    conversationId?: string,
  ) =>
    logAuditEvent({
      organizationId: orgId,
      actorType: "system",
      action: "guard.triggered",
      targetType: "conversation",
      targetId: conversationId,
      metadata: { guardType, threatLevel },
    }),

  // Admin events
  adminAction: (
    orgId: string,
    userId: string,
    action: string,
    targetType?: string,
    targetId?: string,
  ) =>
    logAuditEvent({
      organizationId: orgId,
      actorType: "user",
      actorId: userId,
      action: `admin.${action}`,
      targetType,
      targetId,
    }),

  // Escalation events
  escalated: (
    orgId: string,
    conversationId: string,
    reason: string,
    agentId?: string,
  ) =>
    logAuditEvent({
      organizationId: orgId,
      actorType: agentId ? "ai_agent" : "system",
      actorId: agentId,
      action: "conversation.escalated",
      targetType: "conversation",
      targetId: conversationId,
      metadata: { reason },
    }),

  // Channel events
  channelMessage: (
    orgId: string,
    channel: string,
    visitorId: string,
    direction: "inbound" | "outbound",
  ) =>
    logAuditEvent({
      organizationId: orgId,
      actorType: "visitor",
      actorId: visitorId,
      action: `channel.${direction}`,
      metadata: { channel },
    }),
} as const;
