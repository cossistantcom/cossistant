import type { SkillName, SkillPrompt } from "../personas/types";
import { COMPLIANCE_GUARD_SKILL } from "./compliance-guard";
import { CUSTOMER_SUPPORT_SKILL } from "./customer-support";
import { DIAGNOSTIC_SKILL } from "./diagnostic";
import { ESCALATION_SKILL } from "./escalation";
import { NEW_PROSPECT_SKILL } from "./new-prospect";
import { VOICE_SKILL } from "./voice";

export const SKILL_REGISTRY: Record<SkillName, SkillPrompt> = {
  new_prospect: NEW_PROSPECT_SKILL,
  customer_support: CUSTOMER_SUPPORT_SKILL,
  diagnostic: DIAGNOSTIC_SKILL,
  escalation: ESCALATION_SKILL,
  compliance_guard: COMPLIANCE_GUARD_SKILL,
  voice: VOICE_SKILL,
};

export function getSkill(name: SkillName): SkillPrompt {
  return SKILL_REGISTRY[name];
}

export function getAllSkills(): SkillPrompt[] {
  return Object.values(SKILL_REGISTRY);
}
