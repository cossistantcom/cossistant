import type { GuardResult } from "./types";

const ABUSE_PATTERNS = [
  /\b(fuck|shit|damn|ass|bitch|bastard)\b/i,
  /\b(idiot|stupid|moron|dumb|useless)\b/i,
  /\b(kill|die|hate)\s+(you|this|it)\b/i,
];

const FRUSTRATION_SIGNALS = [
  /!{3,}/, // Multiple exclamation marks
  /\b(AGAIN|STILL|ALWAYS)\b/, // Uppercase frustration words
  /this\s+(is\s+)?ridiculous/i,
  /waste\s+of\s+(my\s+)?time/i,
  /never\s+(works?|working)/i,
  /been\s+waiting\s+(for\s+)?\d/i,
  /spoke\s+to\s+\d+\s+people/i,
];

export function checkModeration(content: string): GuardResult {
  const threats: GuardResult["threats"] = [];

  const abuseCount = ABUSE_PATTERNS.filter((p) => p.test(content)).length;
  if (abuseCount > 0) {
    threats.push({
      type: "abuse",
      description: `Abusive language detected (${abuseCount} patterns)`,
      confidence: Math.min(0.5 + abuseCount * 0.15, 0.95),
    });
  }

  const frustrationCount = FRUSTRATION_SIGNALS.filter((p) =>
    p.test(content),
  ).length;
  if (frustrationCount >= 2) {
    threats.push({
      type: "frustration",
      description: `High frustration detected (${frustrationCount} signals)`,
      confidence: Math.min(0.4 + frustrationCount * 0.12, 0.9),
    });
  }

  return {
    passed: !threats.some((t) => t.type === "abuse" && t.confidence > 0.7),
    threatLevel:
      abuseCount > 2 ? "high" : threats.length > 0 ? "medium" : "none",
    threats,
  };
}
