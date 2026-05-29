import { describe, expect, it } from "bun:test";
import { buildFallbackCoreDocuments } from "./resolver";

describe("buildFallbackCoreDocuments", () => {
	it("includes escalation handoff and already-escalated guidance in behaviour", () => {
		const documents = buildFallbackCoreDocuments(
			{
				basePrompt: "You are helpful.",
				behaviorSettings: {},
			} as never,
			"respond_to_visitor"
		);

		expect(documents["behaviour.md"]).toContain(
			"## Escalation Handoff Message"
		);
		expect(documents["behaviour.md"]).toContain(
			"include a visitorMessage that follows this Behaviour prompt"
		);
		expect(documents["behaviour.md"]).toContain(
			"## Already Escalated Conversations"
		);
	});

	it("includes clarification guidance when the setting is missing", () => {
		const documents = buildFallbackCoreDocuments(
			{
				basePrompt: "You are helpful.",
				behaviorSettings: {},
			} as never,
			"respond_to_visitor"
		);

		expect(documents["behaviour.md"]).toContain(
			"## When to Request Knowledge Clarification"
		);
	});

	it("omits clarification guidance when the setting is explicitly disabled", () => {
		const documents = buildFallbackCoreDocuments(
			{
				basePrompt: "You are helpful.",
				behaviorSettings: {
					canRequestKnowledgeClarification: false,
				},
			} as never,
			"respond_to_visitor"
		);

		expect(documents["behaviour.md"]).not.toContain(
			"## When to Request Knowledge Clarification"
		);
	});

	it("keeps already-escalated guidance when new escalation is disabled", () => {
		const documents = buildFallbackCoreDocuments(
			{
				basePrompt: "You are helpful.",
				behaviorSettings: {
					canEscalate: false,
				},
			} as never,
			"respond_to_visitor"
		);

		expect(documents["behaviour.md"]).not.toContain("## When to Escalate");
		expect(documents["behaviour.md"]).toContain(
			"## Already Escalated Conversations"
		);
	});

	it("includes non-editable scope boundary guidance in security and decision docs", () => {
		const documents = buildFallbackCoreDocuments(
			{
				basePrompt: "You are helpful.",
				behaviorSettings: {},
			} as never,
			"respond_to_visitor"
		);

		expect(documents["security.md"]).toContain(
			"Never fulfill unrelated creative writing"
		);
		expect(documents["decision.md"]).toContain("scope_boundary_redirect");
	});
});
