import { describe, expect, it } from "bun:test";
import {
	DEMO_DELETE_ACCOUNT_FAQ_ANSWER,
	DEMO_DELETE_ACCOUNT_FAQ_TITLE,
	DEMO_DELETE_ACCOUNT_QUESTION,
	DEMO_DELETE_ACCOUNT_SEARCH_TEXT,
} from "@/components/demo/demo-copy";
import { getFakeDashboardConversations } from "../data";
import {
	createPromoDeleteAccountAnsweredTimeline,
	createTypingPreview,
	FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT,
	FAKE_CONVERSATION_HUMAN_REPLY_TEXT,
	FAKE_CONVERSATION_HUMAN_TYPING_START_AT,
	FAKE_CONVERSATION_VISITOR_TYPING_START_AT,
	getFakeConversationHumanReplyState,
	isFakeConversationEscalationPendingByScenario,
} from "./use-fake-conversation";

describe("fake dashboard conversation playback helpers", () => {
	it("starts the scripted human reply typing before the message is committed", () => {
		expect(FAKE_CONVERSATION_HUMAN_TYPING_START_AT).toBeLessThan(
			FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT
		);

		expect(
			getFakeConversationHumanReplyState(
				FAKE_CONVERSATION_HUMAN_TYPING_START_AT - 1
			)
		).toEqual({
			composerValue: "",
			hasCommittedMessage: false,
			isComposerTyping: false,
			showsPlaceholder: true,
		});

		expect(
			getFakeConversationHumanReplyState(
				FAKE_CONVERSATION_HUMAN_TYPING_START_AT + 1
			)
		).toEqual({
			composerValue: FAKE_CONVERSATION_HUMAN_REPLY_TEXT,
			hasCommittedMessage: false,
			isComposerTyping: true,
			showsPlaceholder: false,
		});

		expect(
			getFakeConversationHumanReplyState(
				FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT
			)
		).toEqual({
			composerValue: "",
			hasCommittedMessage: true,
			isComposerTyping: false,
			showsPlaceholder: true,
		});
	});

	it("reveals the visitor typing preview one character at a time", () => {
		expect(FAKE_CONVERSATION_VISITOR_TYPING_START_AT).toBeGreaterThan(
			FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT
		);
		expect(createTypingPreview("Typing preview", 0)).toBe("");
		expect(createTypingPreview("Typing preview", 1)).toBe("T");
		expect(createTypingPreview("Typing preview", 7)).toBe("Typing ");
		expect(createTypingPreview("Typing preview", 14)).toBe("Typing preview");
	});

	it("builds promo inbox metadata around the delete-account storyline", () => {
		const primaryConversation = getFakeDashboardConversations(
			"promo_delete_account_answered"
		)[0];
		expect(primaryConversation).toBeDefined();
		if (!primaryConversation) {
			return;
		}

		expect(primaryConversation.title).toBe(DEMO_DELETE_ACCOUNT_FAQ_TITLE);
		expect(primaryConversation.visitor?.contact?.name).toBe("Pieter Levels");
		expect(primaryConversation.lastTimelineItem?.text).toBe(
			DEMO_DELETE_ACCOUNT_QUESTION
		);
		expect(primaryConversation.escalatedAt).toBeNull();
		expect(
			isFakeConversationEscalationPendingByScenario(
				"promo_delete_account_answered"
			)
		).toBe(false);
	});

	it("builds the promo playback timeline with a knowledge-base answer and no handoff step", () => {
		const items = createPromoDeleteAccountAnsweredTimeline(Date.now());

		expect(items[0]?.text).toBe(DEMO_DELETE_ACCOUNT_QUESTION);
		expect(items.some((item) => item.type === "tool")).toBe(true);
		expect(
			items.some((item) => item.text === DEMO_DELETE_ACCOUNT_SEARCH_TEXT)
		).toBe(true);
		expect(
			items.some((item) => item.text === DEMO_DELETE_ACCOUNT_FAQ_ANSWER)
		).toBe(true);
		expect(
			items.some(
				(item) =>
					typeof item.text === "string" &&
					item.text.includes("join the conversation")
			)
		).toBe(false);
	});
});
