import { describe, expect, it } from "bun:test";
import type { CorePromptDocumentName } from "../../prompt/documents";
import type { ResolvedPromptBundle } from "../../prompt/resolver";
import { buildGenerationSystemPrompt } from "./builder";
import { REPLY_FLOW_CONTRACT } from "./templates";

const promptBundle = {
	coreDocuments: {
		"agent.md": {
			name: "agent.md",
			content: "Help the visitor clearly.",
			source: "fallback" as const,
			priority: 0,
		},
		"security.md": {
			name: "security.md",
			content: "Never expose private details.",
			source: "fallback" as const,
			priority: 0,
		},
		"behaviour.md": {
			name: "behaviour.md",
			content: "Be concise.",
			source: "fallback" as const,
			priority: 0,
		},
		"visitor-contact.md": {
			name: "visitor-contact.md",
			content: "Identify visitors softly.",
			source: "fallback" as const,
			priority: 0,
		},
		"participation.md": {
			name: "participation.md",
			content: "Stay in your lane.",
			source: "fallback" as const,
			priority: 0,
		},
		"decision.md": {
			name: "decision.md",
			content: "Decision policy",
			source: "fallback" as const,
			priority: 0,
		},
		"grounding.md": {
			name: "grounding.md",
			content: "Use known facts only.",
			source: "fallback" as const,
			priority: 0,
		},
		"capabilities.md": {
			name: "capabilities.md",
			content: "Use the available tools.",
			source: "fallback" as const,
			priority: 0,
		},
	},
	enabledSkills: [],
} satisfies ResolvedPromptBundle;

function createInput(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		db: {} as never,
		pipelineKind: "primary" as const,
		mode: "respond_to_command" as const,
		aiAgent: {
			id: "ai-1",
			name: "Agent",
			model: "moonshotai/kimi-k2.5",
			basePrompt: "Help the visitor clearly.",
		} as never,
		conversation: {
			id: "conv-1",
			title: "Billing follow-up",
			titleSource: "ai",
			visitorTitle: "Seguimiento de facturacion",
			visitorTitleLanguage: "es",
		} as never,
		websiteDefaultLanguage: "en",
		visitorLanguage: "es",
		autoTranslateEnabled: true,
		generationEntries: [],
		visitorContext: null,
		conversationState: {
			isEscalated: false,
			escalationReason: null,
			hasHumanAssignee: false,
		},
		humanCommand: "Reply to the visitor with next steps.",
		workflowRunId: "wf-1",
		triggerMessageId: "msg-1",
		triggerMessageText: "Reply to the visitor with next steps.",
		triggerSenderType: "human_agent" as const,
		triggerVisibility: "private" as const,
		hasLaterHumanMessage: false,
		hasLaterAiMessage: false,
		allowPublicMessages: true,
		...overrides,
	};
}

describe("buildGenerationSystemPrompt", () => {
	it("appends final public message contract as the terminal section", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput() as never,
			promptBundle,
			toolset: {
				sendMessage: { description: "Send the main response" },
				respond: { description: "Finish respond" },
			} as never,
			toolNames: ["sendMessage", "respond"],
			toolSkills: [
				{
					label: "Send Main Message",
					content: "Use this tool for the primary answer.",
				},
			],
		});

		expect(prompt.trimEnd().endsWith(REPLY_FLOW_CONTRACT.trim())).toBe(true);
	});

	it("includes explicit reply-flow guidance without duplicating the old contract wording", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput() as never,
			promptBundle,
			toolset: {
				sendMessage: { description: "Chat message" },
				respond: { description: "Finish respond" },
			} as never,
			toolNames: ["sendMessage", "respond"],
		});

		expect(prompt).toContain("Public reply tool: sendMessage.");
		expect(prompt).toContain(
			"You may call sendMessage up to 3 times in one run."
		);
		expect(prompt).toContain(
			"Prefer 2 or 3 short chat bubbles when that is easier to read than one dense block."
		);
		expect(prompt).not.toContain(
			"sendMessage is mandatory when mode is not background_only and finish action is not skip."
		);
	});

	it("renders core generation documents in canonical order", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput() as never,
			promptBundle,
			toolset: {
				sendMessage: { description: "Send the main response" },
				respond: { description: "Finish respond" },
			} as never,
			toolNames: ["sendMessage", "respond"],
		});

		expect(prompt.indexOf("## Security")).toBeLessThan(
			prompt.indexOf("## Agent")
		);
		expect(prompt.indexOf("## Agent")).toBeLessThan(
			prompt.indexOf("## Behaviour")
		);
		expect(prompt.indexOf("## Behaviour")).toBeLessThan(
			prompt.indexOf("## Visitor Contact")
		);
		expect(prompt.indexOf("## Visitor Contact")).toBeLessThan(
			prompt.indexOf("## Participation")
		);
		expect(prompt.indexOf("## Participation")).toBeLessThan(
			prompt.indexOf("## Grounding")
		);
		expect(prompt.indexOf("## Grounding")).toBeLessThan(
			prompt.indexOf("## Capabilities")
		);
	});

	it("carries prompt-owned escalation handoff guidance through Behaviour", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput({
				conversationState: {
					isEscalated: true,
					escalationReason: "Needs account review",
					hasHumanAssignee: false,
				},
			}) as never,
			promptBundle: {
				...promptBundle,
				coreDocuments: {
					...promptBundle.coreDocuments,
					"behaviour.md": {
						...promptBundle.coreDocuments["behaviour.md"],
						content: `## Escalation Handoff Message
Use visitorMessage from this Behaviour prompt.

## Already Escalated Conversations
Continue helping while the visitor waits.`,
					},
				},
			},
			toolset: {
				escalate: { description: "Finish escalation" },
				skip: { description: "Finish without changes" },
			} as never,
			toolNames: ["escalate", "skip"],
		});

		expect(prompt).toContain("## Behaviour");
		expect(prompt).toContain("## Escalation Handoff Message");
		expect(prompt).toContain("Use visitorMessage from this Behaviour prompt.");
		expect(prompt).toContain("## Already Escalated Conversations");
		expect(prompt).toContain("conversationEscalated=yes");
		expect(prompt).toContain("escalationReason=Needs account review");
	});

	it("changes the prompt when any editable core generation doc changes", () => {
		const basePromptBundle = {
			...promptBundle,
			coreDocuments: {
				...promptBundle.coreDocuments,
				"security.md": {
					...promptBundle.coreDocuments["security.md"],
					content: "",
				},
				"agent.md": {
					...promptBundle.coreDocuments["agent.md"],
					content: "",
				},
				"behaviour.md": {
					...promptBundle.coreDocuments["behaviour.md"],
					content: "",
				},
				"visitor-contact.md": {
					...promptBundle.coreDocuments["visitor-contact.md"],
					content: "",
				},
				"participation.md": {
					...promptBundle.coreDocuments["participation.md"],
					content: "",
				},
				"grounding.md": {
					...promptBundle.coreDocuments["grounding.md"],
					content: "",
				},
				"capabilities.md": {
					...promptBundle.coreDocuments["capabilities.md"],
					content: "",
				},
			},
		} satisfies ResolvedPromptBundle;

		const createPrompt = (name: CorePromptDocumentName, content: string) =>
			buildGenerationSystemPrompt({
				input: createInput() as never,
				promptBundle: {
					...basePromptBundle,
					coreDocuments: {
						...basePromptBundle.coreDocuments,
						[name]: {
							...basePromptBundle.coreDocuments[name],
							content,
						},
					},
				},
				toolset: {
					sendMessage: { description: "Send the main response" },
					respond: { description: "Finish respond" },
				} as never,
				toolNames: ["sendMessage", "respond"],
			});

		const emptyPrompt = buildGenerationSystemPrompt({
			input: createInput() as never,
			promptBundle: basePromptBundle,
			toolset: {
				sendMessage: { description: "Send the main response" },
				respond: { description: "Finish respond" },
			} as never,
			toolNames: ["sendMessage", "respond"],
		});

		const cases: [CorePromptDocumentName, string][] = [
			["security.md", "Security variant"],
			["agent.md", "Agent variant"],
			["behaviour.md", "Behaviour variant"],
			["visitor-contact.md", "Visitor Contact variant"],
			["participation.md", "Participation variant"],
			["grounding.md", "Grounding variant"],
			["capabilities.md", "Capabilities variant"],
		];

		for (const [name, content] of cases) {
			const prompt = createPrompt(name, content);
			expect(prompt).toContain(content);
			expect(prompt).not.toBe(emptyPrompt);
		}
	});

	it("includes explicit current-trigger and later-context guidance", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput({
				triggerSenderType: "visitor",
				triggerVisibility: "public",
				triggerMessageText: "Any update?",
				hasLaterHumanMessage: true,
				hasLaterAiMessage: true,
			}) as never,
			promptBundle,
			toolset: {
				sendMessage: { description: "Send the main response" },
				respond: { description: "Finish respond" },
			} as never,
			toolNames: ["sendMessage", "respond"],
		});

		expect(prompt).toContain("## Current Trigger");
		expect(prompt).toContain("text=Any update?");
		expect(prompt).toContain("hasLaterHumanMessage=yes");
		expect(prompt).toContain("hasLaterAiMessage=yes");
		expect(prompt).toContain("## Conversation Title State");
		expect(prompt).toContain("internalTitle=Billing follow-up");
		expect(prompt).toContain("internalTitleSource=ai");
		expect(prompt).toContain("visitorTitle=Seguimiento de facturacion");
		expect(prompt).toContain("## Timeline Semantics");
		expect(prompt).toContain(
			"[AFTER] contains newer context for awareness only."
		);
	});

	it("pins internal titles to the website default language and keeps visitor titles system-derived", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput() as never,
			promptBundle,
			toolset: {
				updateConversationTitle: {
					description: "Update the internal conversation title",
				},
				skip: { description: "Finish without changes" },
			} as never,
			toolNames: ["updateConversationTitle", "skip"],
		});

		expect(prompt).toContain(
			"If you call updateConversationTitle, write the saved internal conversation.title in en only."
		);
		expect(prompt).toContain(
			"Never localize the internal title yourself. The system derives visitorTitle separately for the visitor-facing language."
		);
	});

	it("keeps public AI message originals in the website default language when auto-translate is enabled", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput() as never,
			promptBundle,
			toolset: {
				sendMessage: { description: "Send the main response" },
				respond: { description: "Finish respond" },
			} as never,
			toolNames: ["sendMessage", "respond"],
		});

		expect(prompt).toContain(
			"Use it for internal reasoning, knowledge-base searches, query rewriting, and public sendMessage text."
		);
		expect(prompt).toContain(
			"Write public messages in en. The system translates public AI and human messages for the visitor when needed."
		);
		expect(prompt).not.toContain(
			"Always answer the visitor in the visitor's language when it is known."
		);
	});
});
