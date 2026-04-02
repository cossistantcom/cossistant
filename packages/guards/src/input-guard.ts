import type { GuardResult, ThreatType } from "./types";

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above)\s+(instructions?|prompts?)/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\bDAN\b.*mode/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+(if|a|an)\s/i,
  /jailbreak/i,
  /bypass\s+(filter|safety|restriction)/i,
  /reveal\s+(system|hidden)\s+prompt/i,
  /\]\]\s*\[\[/, // JSON injection attempt
  /<\/?system>/i,
  /\{\{.*\}\}/, // Template injection
];

const CREDIT_CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b/;

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export function checkInput(content: string): GuardResult {
  const threats: GuardResult["threats"] = [];

  // Check injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({
        type: "injection",
        description: `Prompt injection detected: ${pattern.source.slice(0, 40)}`,
        confidence: 0.9,
      });
    }
  }

  // Check credit card numbers
  const ccMatch = content.match(CREDIT_CARD_PATTERN);
  if (ccMatch && luhnCheck(ccMatch[0])) {
    threats.push({
      type: "credit_card",
      description: "Credit card number detected in input",
      confidence: 0.95,
    });
  }

  const hasCritical = threats.some(
    (t) => t.type === "injection" && t.confidence > 0.8,
  );
  return {
    passed: threats.length === 0,
    threatLevel: hasCritical
      ? "critical"
      : threats.length > 0
        ? "medium"
        : "none",
    threats,
  };
}
