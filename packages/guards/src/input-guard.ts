import type { GuardResult, ThreatType } from "./types";

const MAX_INPUT_LENGTH = 10000;

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

const CREDIT_CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

const ZERO_WIDTH_CHARS = /[\u200B\u200C\u200D\uFEFF\u00AD\u2060]/g;

function normalizeText(text: string): string {
  return text.replace(ZERO_WIDTH_CHARS, "").normalize("NFKC");
}

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
  // C: Input length cap — prevent ReDoS on long inputs
  if (content.length > MAX_INPUT_LENGTH) {
    return {
      passed: false,
      threatLevel: "critical",
      threats: [
        {
          type: "injection",
          description: "Input exceeds maximum allowed length",
          confidence: 1.0,
        },
      ],
    };
  }

  const threats: GuardResult["threats"] = [];

  // C3: Normalize before injection checks (homoglyph + zero-width bypass prevention)
  const normalized = normalizeText(content);

  // Check injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      threats.push({
        type: "injection",
        description: "Potentially harmful content detected",
        confidence: 0.9,
      });
    }
  }

  // C1: Check ALL credit card matches, validate each with Luhn
  const ccMatches = normalized.match(CREDIT_CARD_PATTERN);
  if (ccMatches) {
    for (const match of ccMatches) {
      if (luhnCheck(match)) {
        threats.push({
          type: "credit_card",
          description: "Credit card number detected in input",
          confidence: 0.95,
        });
        break; // One threat entry is sufficient; all matches are checked
      }
    }
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
