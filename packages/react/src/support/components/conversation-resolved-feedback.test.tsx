import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConversationStatus } from "@plasma/types";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type CossistantContextValue, SupportContext } from "../../provider";
import { SupportTextProvider } from "../text";
import { ConversationResolvedFeedback } from "./conversation-resolved-feedback";

function createSupportContextValue(): CossistantContextValue {
	return {
		website: {
			id: "site_123",
			name: "Acme",
			availableAIAgents: [],
			availableHumanAgents: [],
			visitor: {
				id: "visitor_123",
				language: "en",
				contact: null,
				isBlocked: false,
			},
		} as CossistantContextValue["website"],
		defaultMessages: [],
		quickOptions: [],
		setDefaultMessages: () => {},
		setQuickOptions: () => {},
		unreadCount: 0,
		setUnreadCount: () => {},
		isLoading: false,
		error: null,
		configurationError: null,
		client: null,
		isOpen: false,
		open: () => {},
		close: () => {},
		toggle: () => {},
	};
}

function renderWithSupportText(node: React.ReactNode): string {
	return renderToStaticMarkup(
		<SupportContext.Provider value={createSupportContextValue()}>
			<SupportTextProvider>{node}</SupportTextProvider>
		</SupportContext.Provider>
	);
}

describe("ConversationResolvedFeedback", () => {
	it("renders the shared rating primitive in the resolved thank-you state", () => {
		const html = renderWithSupportText(
			<ConversationResolvedFeedback
				rating={5}
				status={ConversationStatus.RESOLVED}
			/>
		);

		expect(html).toContain('data-feedback-rating-selector="true"');
		expect(html).toContain("Thanks for your feedback!");
	});

	it("uses the shared feedback primitives without the old composer hook", () => {
		const source = readFileSync(
			join(import.meta.dir, "conversation-resolved-feedback.tsx"),
			"utf8"
		);

		expect(source).toContain(
			'from "../../primitives/feedback-rating-selector"'
		);
		expect(source).toContain('from "../../primitives/feedback-comment-input"');
		expect(source).not.toContain("useFeedbackComposer");
	});
});
