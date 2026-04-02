import type { Dossier } from "./types";

const STALE_THRESHOLD_HOURS = 72;

export function generateSessionOpener(dossier: Dossier): string | null {
  const lastInteraction = new Date(dossier.lastInteractionAt);
  const hoursSince =
    (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60);

  if (hoursSince < 1) return null; // Recent — no opener needed

  if (hoursSince > STALE_THRESHOLD_HOURS) {
    return `Welcome back! It's been a while since we last spoke. How can I help you today?`;
  }

  // Extract the last topic from dossier content
  const lines = dossier.content.split("\n").filter((l) => l.trim());
  const lastTopic = lines[lines.length - 1];

  if (lastTopic && lastTopic.length < 200) {
    return `Welcome back! Last time we were discussing: ${lastTopic.trim()}. Would you like to continue with that, or is there something new I can help with?`;
  }

  return `Welcome back! How can I help you today?`;
}
