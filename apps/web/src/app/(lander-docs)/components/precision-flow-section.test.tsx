import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	getPrecisionFlowPrimaryActionPresentation,
	getPrecisionFlowReplayButtonLabel,
	PrecisionFlowSection,
} from "./precision-flow-section";

// The precision stage renders the real dashboard timeline, which reaches for
// tRPC, react-query and website context. None of that is available in a
// server-render test, so stub the three touch points the tree actually uses.
mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		conversation: {
			translateMessageGroup: {
				mutationOptions: () => ({}),
			},
		},
	}),
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutateAsync: async () => null,
	}),
}));

mock.module("@/contexts/website", () => ({
	useOptionalWebsite: () => null,
}));

describe("PrecisionFlowSection", () => {
	it("renders a clean conversation surface without browser or dashboard chrome", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection
					autoplay={false}
					initialPhase="visitor_question"
				/>
			</React.StrictMode>
		);

		expect(html).not.toContain('data-slot="browser-shell"');
		expect(html).not.toContain("Local time");
		expect(html).not.toContain("Country");
		expect(html).not.toContain("sidebar-collapse");
		expect(html).not.toContain("Join the conversation");
	});

	it("starts with a centered messages-only timeline before clarification begins", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection
					autoplay={false}
					initialPhase="visitor_question"
				/>
			</React.StrictMode>
		);

		expect(html).toContain("How do I delete my account?");
		expect(html).toContain("How it learns");
		expect(html).toContain("When the AI agent doesn&#x27;t know,");
		expect(html).toContain("Customer asks");
		expect(html).toContain("Cossistant checks");
		expect(html).toContain("Your team answers");
		expect(html).toContain("Next time, Cossistant knows");
		expect(html).toContain('data-fake-conversation-layout-mode="centered"');
		expect(html).toContain('data-precision-stage-layout="centered"');
		expect(html).toContain('data-precision-background-trail="enabled"');
		expect(html).toContain('data-precision-opening-radial="true"');
		expect(html).toContain('data-background="aurora-ascii"');
		expect(html).not.toContain('data-composer-frame="default"');
		expect(html).not.toContain('data-composer-layout-mode="inline"');
		expect(html).not.toContain('aria-label="Message visibility"');
	});

	it("shows the real search loading activity before the no-results state", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection
					autoplay={false}
					initialPhase="gap_search_loading"
				/>
			</React.StrictMode>
		);

		expect(html).toContain("How do I delete my account?");
		expect(html).toContain('data-tool-execution-indicator="spinner"');
		expect(html).toContain("Searching for &quot;delete account&quot;...");
		expect(html).not.toContain(
			"I don&#x27;t know this one yet, so I&#x27;m asking the team and saving the answer for next time."
		);
	});

	it("keeps the opening handoff beats message-only until clarification starts", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection autoplay={false} initialPhase="human_handoff" />
			</React.StrictMode>
		);

		expect(html).toContain(
			"I don&#x27;t know this one yet, so I&#x27;m asking the team and saving the answer for next time."
		);
		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).toContain(
			"No saved answer for &quot;delete account&quot; yet"
		);
		expect(html).toContain('data-precision-opening-radial="true"');
		expect(html).not.toContain("Type your message...");
		expect(html).not.toContain('type="file"');
	});

	it("reuses the shared clarification prompt inside the real composer shell", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection autoplay={false} initialPhase="clarify_prompt" />
			</React.StrictMode>
		);

		expect(html).toContain('data-composer-frame="highlighted"');
		expect(html).toContain('data-composer-layout-mode="inline"');
		expect(html).toContain("Clarification");
		expect(html).toContain("Later");
		expect(html).toContain("Clarify");
		expect(html).toContain(
			"Answer this once. Cossistant will use it next time."
		);
		expect(html).toContain("Type your message...");
		expect(html).toContain('aria-label="Message visibility"');
		expect(html).toContain("Reply");
		expect(html).toContain("Private note");
		expect(html).toContain('type="file"');
		expect(html).not.toContain('data-precision-opening-radial="true"');
		expect(html).not.toContain("autofocus");
		expect(html).not.toContain("How do I delete my account?");
		expect(html).not.toContain(
			"I don&#x27;t know this one yet, so I&#x27;m asking the team and saving the answer for next time."
		);
	});

	it("marks the clarify click phase so the fake cursor can target the clarify button", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection autoplay={false} initialPhase="clarify_click" />
			</React.StrictMode>
		);

		expect(html).toContain('data-precision-cursor="clarify"');
		expect(html).toContain("Clarify");
	});

	it("reuses the shared clarification question and action blocks", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection autoplay={false} initialPhase="question_one" />
			</React.StrictMode>
		);

		expect(html).toContain('data-composer-frame="highlighted"');
		expect(html).toContain("Clarification questions");
		expect(html).toContain('data-clarification-textarea-overlay="true"');
		expect(html).toContain('data-fake-textarea-display="true"');
		expect(html).toContain('data-fake-textarea-display-state="typing"');
		expect(html).toContain('data-text-effect-caret="true"');
		expect(html).toContain('data-text-effect-visible="true"');
		expect(html).toContain("Next");
		expect(html).not.toContain("autofocus");
		expect(html).not.toContain("How do I delete my account?");
	});

	it("uses a simultaneous transition layer when switching from conversation to composer", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection
					autoplay={false}
					initialPhase="clarify_transition"
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-precision-transition-stage="clarify"');
		expect(html).toContain('data-precision-transition-layer="timeline"');
		expect(html).toContain('data-precision-transition-layer="composer"');
		expect(html).toContain(
			"I don&#x27;t know this one yet, so I&#x27;m asking the team and saving the answer for next time."
		);
		expect(html).toContain("Clarification");
		expect(html).not.toContain('data-precision-opening-radial="true"');
	});

	it("shows the first-step next cursor before advancing to the follow-up question", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection
					autoplay={false}
					initialPhase="question_one_next_click"
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-precision-cursor="question-one-next"');
		expect(html).toContain('data-clarification-submit-target="true"');
		expect(html).toContain("How does account deletion work today?");
		expect(html).not.toContain(
			"Where should the visitor go to start the deletion flow?"
		);
	});

	it("shows the answer-select cursor on the suggested-answer step", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection
					autoplay={false}
					initialPhase="question_two_select"
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-precision-cursor="answer-select"');
		expect(html).toContain('data-clarification-answer-target="true"');
		expect(html).toContain("Cancel");
		expect(html).toContain("Skip");
		expect(html).toContain("Next");
	});

	it("renders the real draft review inside the composer once the flow completes", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection autoplay={false} initialPhase="draft_ready" />
			</React.StrictMode>
		);

		expect(html).toContain('data-clarification-slot="review"');
		expect(html).toContain('data-clarification-slot="review-actions"');
		expect(html).toContain("Review FAQ draft");
		expect(html).toContain("Skip");
		expect(html).toContain("Approve");
		expect(html).toContain('data-composer-layout-mode="inline"');
		expect(html).not.toContain(
			'data-knowledge-clarification-draft-preview="true"'
		);
	});

	it("returns to a composer-only view after the transition completes", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection autoplay={false} initialPhase="clarify_prompt" />
			</React.StrictMode>
		);

		expect(html).not.toContain('data-precision-transition-stage="clarify"');
		expect(html).toContain("Clarification");
		expect(html).not.toContain(
			"I don&#x27;t know this one yet, so I&#x27;m asking the team and saving the answer for next time."
		);
	});

	it("replaces the conversation with a standalone faq-created card after approval", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PrecisionFlowSection autoplay={false} initialPhase="faq_created" />
			</React.StrictMode>
		);

		expect(html).toContain('data-precision-faq-created-state="true"');
		expect(html).toContain('data-precision-faq-list="true"');
		expect(html).toContain('data-precision-faq-list-item="before"');
		expect(html).toContain('data-precision-faq-list-item="approved"');
		expect(html).toContain('data-precision-faq-list-item="after"');
		expect(html).toContain('data-precision-faq-skeleton="before"');
		expect(html).toContain('data-precision-faq-skeleton="after"');
		expect(html).toContain('data-slot="skeleton"');
		expect(html).toContain('data-knowledge-clarification-draft-preview="true"');
		expect(html).toContain(
			'data-knowledge-clarification-draft-preview-variant="minimal"'
		);
		expect(html).toContain(
			'data-knowledge-clarification-draft-preview-pill="FAQ generated"'
		);
		expect(html).toContain(
			'data-knowledge-clarification-draft-preview-pill="Account"'
		);
		expect(html).toContain("w-[84%]");
		expect(html).toContain("w-[86%]");
		expect(html).toContain("self-center");
		expect(html).not.toContain('data-precision-opening-radial="true"');
		expect(html).not.toContain('data-clarification-slot="review"');
		expect(html).not.toContain("Knowledge base updated");
	});

	it("formats the primary action label for replay, countdown, and resume states", () => {
		expect(
			getPrecisionFlowReplayButtonLabel({
				isManuallyPaused: false,
				replayCountdownSeconds: null,
			})
		).toBe("Replay flow");
		expect(
			getPrecisionFlowReplayButtonLabel({
				isManuallyPaused: false,
				replayCountdownSeconds: 10,
			})
		).toBe("Replay in 10s");
		expect(
			getPrecisionFlowReplayButtonLabel({
				isManuallyPaused: true,
				replayCountdownSeconds: 7,
			})
		).toBe("Resume");
	});

	it("uses a play icon and primary styling when the flow is manually paused", () => {
		expect(
			getPrecisionFlowPrimaryActionPresentation({
				isManuallyPaused: true,
				replayCountdownSeconds: null,
			})
		).toMatchObject({
			label: "Resume",
			variant: "default",
		});
		expect(
			getPrecisionFlowPrimaryActionPresentation({
				isManuallyPaused: false,
				replayCountdownSeconds: 10,
			})
		).toMatchObject({
			label: "Replay in 10s",
			variant: "outline",
		});
	});
});
