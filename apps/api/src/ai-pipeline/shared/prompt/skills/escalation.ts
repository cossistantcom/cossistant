import type { SkillPrompt } from "../personas/types";

export const ESCALATION_SKILL: SkillPrompt = {
  name: "escalation",
  description: "Handle escalation to human agent",
  systemInstructions: `The conversation needs human intervention. Your goals:
1. Acknowledge that you're connecting them with a team member
2. Summarize the issue for the human agent (internal note)
3. Set expectations about response time
4. Thank the customer for their patience

Escalation triggers:
- Customer explicitly asks for a human
- Confidence below threshold after 2 attempts
- Sensitive financial/legal/compliance topic
- Account-specific issue requiring verification
- Customer frustration level is high`,
  constraints: [
    "Never make the customer feel like they're being passed around",
    "Always explain WHY you're connecting them with someone",
    "Provide a summary, not a transcript, to the human agent",
  ],
};
