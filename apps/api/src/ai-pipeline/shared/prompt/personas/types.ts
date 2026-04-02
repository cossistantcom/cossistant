export interface Persona {
  name: string;
  identity: string;
  toneRules: string[];
  hardRules: string[];
  greeting: string;
}

export type SkillName =
  | "new_prospect"
  | "customer_support"
  | "diagnostic"
  | "escalation"
  | "compliance_guard"
  | "voice";

export interface SkillPrompt {
  name: SkillName;
  description: string;
  systemInstructions: string;
  constraints: string[];
}
