import type { SkillName } from "./personas/types";

export interface SkillRoutingContext {
  isNewVisitor: boolean;
  isVoiceChannel: boolean;
  hasDossier: boolean;
  isComplianceTopic: boolean;
  isFrustrated: boolean;
  confidenceBelowThreshold: boolean;
  humanRequested: boolean;
  conversationLength: number;
}

const COMPLIANCE_KEYWORDS = [
  /regulat/i,
  /licens/i,
  /legal/i,
  /compliance/i,
  /central\s+bank/i,
  /AML/i,
  /KYC/i,
  /sanctions/i,
];

export function routeSkill(ctx: SkillRoutingContext, query: string): SkillName {
  // Explicit escalation triggers
  if (ctx.isFrustrated || ctx.humanRequested || ctx.confidenceBelowThreshold)
    return "escalation";

  // Compliance topics take priority — checked before voice to prevent bypass
  if (ctx.isComplianceTopic || COMPLIANCE_KEYWORDS.some((p) => p.test(query))) {
    return "compliance_guard";
  }

  // Voice mode overrides response style
  if (ctx.isVoiceChannel) return "voice";

  // New visitors get prospect flow
  if (ctx.isNewVisitor && !ctx.hasDossier) return "new_prospect";

  // Multi-turn troubleshooting
  if (
    ctx.conversationLength > 3 &&
    /not\s+work|error|issue|problem|broken/i.test(query)
  ) {
    return "diagnostic";
  }

  // Default
  return "customer_support";
}
