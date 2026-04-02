import type { DossierUpdate } from "./types";
import { sanitizeDossierContent } from "./sanitizer";

export function formatDossierEntry(update: DossierUpdate): string {
  const timestamp = new Date().toISOString().split("T")[0];
  const topics =
    update.keyTopics.length > 0
      ? update.keyTopics.join(", ")
      : "general inquiry";

  let entry = `\n## ${timestamp} — ${topics}\n`;
  entry += `Sentiment: ${update.sentiment}\n`;
  entry += `${update.conversationSummary}\n`;

  if (update.resolution) {
    entry += `Resolution: ${update.resolution}\n`;
  }

  return sanitizeDossierContent(entry);
}

export function appendToDossier(
  existingContent: string,
  newEntry: string,
): string {
  const combined = existingContent + newEntry;
  // Rough token estimate (1 token ≈ 4 chars)
  const estimatedTokens = Math.ceil(combined.length / 4);

  // Keep under 4000 tokens — trim oldest entries
  if (estimatedTokens > 4000) {
    const sections = combined.split(/\n## /);
    const header = sections[0];
    const entries = sections.slice(1);
    // Keep the most recent entries that fit
    let kept = header;
    for (let i = entries.length - 1; i >= 0; i--) {
      const candidate = kept + "\n## " + entries[i];
      if (Math.ceil(candidate.length / 4) <= 4000) {
        kept = candidate;
      } else {
        break;
      }
    }
    return kept;
  }

  return combined;
}
