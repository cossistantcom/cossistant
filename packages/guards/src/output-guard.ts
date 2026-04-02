import type { GuardResult } from "./types";

const FINANCIAL_CLAIM_PATTERNS = [
  /guaranteed\s+return/i,
  /risk[\s-]free\s+(investment|return)/i,
  /you\s+will\s+(earn|make|receive)\s+\d/i,
  /annual\s+percentage\s+yield/i,
  /FDIC\s+insured/i,
  /we\s+are\s+a\s+bank/i,
  /banking\s+license/i,
  /deposit\s+insurance/i,
];

const PII_ECHO_PATTERNS = [
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
  /\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{0,2}\b/i, // IBAN
];

const BRAND_VIOLATIONS = [
  /I('m| am) (just )?an? (AI|bot|language model|LLM)/i,
  /as an AI/i,
  /I don't have (feelings|emotions|opinions)/i,
];

export function checkOutput(content: string): GuardResult {
  const threats: GuardResult["threats"] = [];

  for (const pattern of FINANCIAL_CLAIM_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({
        type: "financial_claim",
        description: `Financial claim detected: ${pattern.source.slice(0, 40)}`,
        confidence: 0.85,
      });
    }
  }

  for (const pattern of PII_ECHO_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({
        type: "pii_exposure",
        description: "PII echoed in response",
        confidence: 0.9,
      });
    }
  }

  for (const pattern of BRAND_VIOLATIONS) {
    if (pattern.test(content)) {
      threats.push({
        type: "regulatory_violation",
        description: "Brand voice violation — AI self-identification",
        confidence: 0.7,
      });
    }
  }

  return {
    passed: threats.length === 0,
    threatLevel: threats.some((t) => t.confidence > 0.85)
      ? "high"
      : threats.length > 0
        ? "medium"
        : "none",
    threats,
  };
}
