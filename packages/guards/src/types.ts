export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";

export type ThreatType =
  | "injection"
  | "pii_exposure"
  | "credit_card"
  | "abuse"
  | "frustration"
  | "financial_claim"
  | "regulatory_violation"
  | "off_topic";

export interface GuardResult {
  passed: boolean;
  threatLevel: ThreatLevel;
  threats: Array<{
    type: ThreatType;
    description: string;
    confidence: number;
  }>;
  sanitizedContent?: string;
}
