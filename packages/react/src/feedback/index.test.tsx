import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SupportControllerContext } from "../controller-context";
import { type CossistantContextValue, SupportContext } from "../provider";
import { createMockSupportController } from "../test-utils/create-mock-support-controller";
import { Feedback } from "./index";

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
		client: {
			submitFeedback: async () => ({
				feedback: {
					id: "feedback_123",
				},
			}),
		} as CossistantContextValue["client"],
		isOpen: false,
		open: () => {},
		close: () => {},
		toggle: () => {},
	};
}

function renderWithSupportContext(node: React.ReactNode): string {
	return renderToStaticMarkup(
		<SupportControllerContext.Provider value={createMockSupportController()}>
			<SupportContext.Provider value={createSupportContextValue()}>
				{node}
			</SupportContext.Provider>
		</SupportControllerContext.Provider>
	);
}

describe("Feedback widget", () => {
	it("keeps shared styles opt-in from the feedback entrypoint", () => {
		const source = readFileSync(join(import.meta.dir, "index.tsx"), "utf8");

		expect(source).not.toContain('import "../support/support.css";');
	});

	it("renders the default panel with shared feedback primitives", () => {
		const html = renderWithSupportContext(
			<Feedback
				defaultOpen
				topics={["Bug", "Feature request", "Pricing"]}
				trigger="billing"
			/>
		);

		expect(html).toContain("Share feedback");
		expect(html).toContain('data-slot="feedback-root"');
		expect(html).toContain('data-slot="feedback-trigger"');
		expect(html).toContain('data-slot="feedback-content"');
		expect(html).toContain('data-slot="feedback-panel"');
		expect(html).toContain('data-slot="feedback-submit"');
		expect(html).toContain('data-feedback-panel="true"');
		expect(html).toContain('data-feedback-submit="true"');
		expect(html).toContain('data-feedback-rating-selector="true"');
		expect(html).toContain('data-feedback-topic-select="true"');
		expect(html).toContain("Select a topic...");
	});

	it("keeps custom content hidden when the root is closed", () => {
		const html = renderWithSupportContext(
			<Feedback.Root open={false}>
				<Feedback.Trigger>Open feedback</Feedback.Trigger>
				<Feedback.Content>
					<div>Custom feedback body</div>
				</Feedback.Content>
			</Feedback.Root>
		);

		expect(html).toContain("Open feedback");
		expect(html).not.toContain("Custom feedback body");
	});

	it("renders custom trigger and content when the root is open", () => {
		const html = renderWithSupportContext(
			<Feedback.Root open theme="dark">
				<Feedback.Trigger>Open feedback</Feedback.Trigger>
				<Feedback.Content>
					<div>Custom feedback body</div>
				</Feedback.Content>
			</Feedback.Root>
		);

		expect(html).toContain("Open feedback");
		expect(html).toContain("Custom feedback body");
		expect(html).toContain('data-color-scheme="dark"');
	});

	it("registers fragment-wrapped trigger and content children", () => {
		const html = renderWithSupportContext(
			<Feedback.Root open>
				<React.Fragment key="wrapped-feedback-children">
					<Feedback.Trigger>Open feedback</Feedback.Trigger>
					<Feedback.Content>
						<div>Fragment feedback body</div>
					</Feedback.Content>
				</React.Fragment>
			</Feedback.Root>
		);

		expect(html).toContain("Open feedback");
		expect(html).toContain("Fragment feedback body");
	});

	it("submits through the shared feedback hook", () => {
		const source = readFileSync(
			join(import.meta.dir, "components", "panel.tsx"),
			"utf8"
		);

		expect(source).toContain("useFeedbackForm");
		expect(source).toContain("feedback.handleSubmit");
		expect(source).toContain("feedback.handleTopicChange");
		expect(source).toContain("feedback.handleRatingSelect");
		expect(source).toContain("conversationId");
		expect(source).not.toContain('role="alert"');
		expect(source).not.toContain("useSubmitFeedback");
		expect(source).not.toContain("client.submitFeedback({");
		expect(source).not.toContain("useFeedbackComposer");
	});
});
