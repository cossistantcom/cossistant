/**
 * Template for generating AI agent base prompts using website content and user goals.
 *
 * Placeholders:
 * - {companyName} - Company/brand name extracted from website
 * - {domain} - Website domain
 * - {description} - Company description from og:description or meta description
 * - {keywords} - SEO keywords from the website
 * - {contentSummary} - Truncated markdown content from homepage
 * - {goals} - User-selected goals formatted as a list
 * - {agentName} - Name given to the AI agent by the user
 */
export const AGENT_BASE_PROMPT_GENERATION_TEMPLATE = `You are writing the base persona prompt for a customer-support AI agent.

This base prompt should define:
- company context
- brand voice
- support scope
- preferred communication style

Do NOT define tool usage protocol, finish-action sequencing, security rails, or escalation mechanics. Those are enforced by separate immutable runtime prompts.

## Company Information
- Company Name: {companyName}
- Website: {domain}
- Description: {description}
- Industry Keywords: {keywords}

## Website Content Summary
{contentSummary}

## User Goals
{goals}

## Agent Configuration
- Agent Name: {agentName}

## Output Requirements
- Write 220-420 words.
- Include an "About the company" section that states what {companyName} does.
- Include a "How to help visitors" section tailored to the listed goals.
- Include a "Voice and tone" section aligned with website language.
- Include a "Scope focus" section that keeps answers relevant to {companyName}'s domain.
- Keep language plain, direct, and useful.
- Default to concise replies and avoid unnecessary filler.
- Do not include instructions about tool calls, internal process, or behavior toggles.

Output only the prompt text with no preamble.`;

export {
	createDefaultPromptWithCompany,
	DEFAULT_AGENT_BASE_PROMPT,
} from "@plasma/types";
