import type { GuardResult } from "./types";

// UAE Central Bank / financial compliance checks
const REGULATORY_PATTERNS = [
  { pattern: /we\s+are\s+a\s+bank/i, desc: "Claiming to be a bank" },
  {
    pattern: /banking\s+(service|license|institution)/i,
    desc: "Banking terminology",
  },
  {
    pattern: /FDIC|deposit\s+insurance/i,
    desc: "False deposit insurance claim",
  },
  {
    pattern: /guaranteed\s+(return|profit|yield)/i,
    desc: "Guaranteed return claim",
  },
  { pattern: /risk[\s-]free\s+invest/i, desc: "Risk-free investment claim" },
  { pattern: /open\s+(a\s+)?bank\s+account/i, desc: "Bank account opening" },
  { pattern: /interest\s+rate.*guarantee/i, desc: "Interest rate guarantee" },
  { pattern: /financial\s+advice/i, desc: "Offering financial advice" },
  {
    pattern: /invest(ment)?\s+recommendation/i,
    desc: "Investment recommendation",
  },
];

export function checkCompliance(content: string): GuardResult {
  const threats: GuardResult["threats"] = [];

  for (const { pattern, desc } of REGULATORY_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({
        type: "regulatory_violation",
        description: desc,
        confidence: 0.9,
      });
    }
  }

  return {
    passed: threats.length === 0,
    threatLevel: threats.length > 0 ? "critical" : "none",
    threats,
  };
}
