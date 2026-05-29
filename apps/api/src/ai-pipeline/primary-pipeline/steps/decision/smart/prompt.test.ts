import { describe, expect, it } from "bun:test";
import { buildSmartDecisionPrompt } from "./prompt";

describe("buildSmartDecisionPrompt", () => {
	it("renders before, trigger, and later message sections with explicit FIFO guidance", () => {
		const prompt = buildSmartDecisionPrompt(
			{
				db: {} as never,
				aiAgent: {
					id: "ai-1",
					name: "Agent",
				} as never,
				conversation: {
					id: "conv-1",
				} as never,
				decisionMessages: [
					{
						messageId: "msg-1",
						content: "My invoice is wrong.",
						senderType: "visitor",
						senderId: "visitor-1",
						senderName: null,
						timestamp: "2026-03-20T10:00:00.000Z",
						visibility: "public",
						segment: "before_trigger",
					},
					{
						messageId: "msg-2",
						content: "Can you confirm the extra seat charge?",
						senderType: "visitor",
						senderId: "visitor-1",
						senderName: null,
						timestamp: "2026-03-20T10:01:00.000Z",
						visibility: "public",
						segment: "trigger",
					},
					{
						messageId: "msg-3",
						content: "I already answered with the seat pricing.",
						senderType: "human_agent",
						senderId: "user-1",
						senderName: "Support Agent",
						timestamp: "2026-03-20T10:02:00.000Z",
						visibility: "public",
						segment: "after_trigger",
					},
				],
				conversationState: {
					hasHumanAssignee: false,
					assigneeIds: [],
					participantIds: [],
					isEscalated: false,
					escalationReason: null,
				},
				triggerMessage: {
					messageId: "msg-2",
					content: "Can you confirm the extra seat charge?",
					senderType: "visitor",
					senderId: "visitor-1",
					senderName: null,
					timestamp: "2026-03-20T10:01:00.000Z",
					visibility: "public",
				},
				decisionPolicy: "Prefer helpful replies when needed.",
			},
			{
				humanActive: false,
				lastHumanSecondsAgo: 60,
				messagesSinceHuman: 1,
				visitorBurstCount: 2,
				recentTurnPattern: "visitor>visitor>human_agent",
				triggerIsShortAckOrGreeting: false,
				triggerIsQuestionOrRequest: true,
				triggerIsSingleNonQuestion: false,
				triggerLooksLikeHumanCommand: false,
				hasLaterHumanMessage: true,
				hasLaterAiMessage: false,
			}
		);

		expect(prompt).toContain('"Current Trigger" is the queued message');
		expect(prompt).toContain("Before Trigger:");
		expect(prompt).toContain("Current Trigger:");
		expect(prompt).toContain("Later Context:");
		expect(prompt).toContain("scope_boundary_redirect");
		expect(prompt).toContain("- [VISITOR][PUBLIC] My invoice is wrong.");
		expect(prompt).toContain(
			"- [TEAM][PUBLIC] I already answered with the seat pricing."
		);
		expect(prompt).toContain("- hasLaterHumanMessage=true");
	});
});
