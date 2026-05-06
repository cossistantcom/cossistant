import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("react-hotkeys-hook", () => ({
	useHotkeys: () => {},
}));

mock.module("motion/react", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	motion: {
		div: ({
			children,
			animate: _animate,
			exit: _exit,
			initial: _initial,
			layout: _layout,
			transition: _transition,
			...props
		}: React.HTMLAttributes<HTMLDivElement> &
			Record<string, unknown> & { children: React.ReactNode }) => (
			<div {...props}>{children}</div>
		),
	},
	useReducedMotion: () => false,
}));

const composerModulePromise = import(".");
const composerSlotKeyModulePromise = import("./composer-slot-key");

describe("Composer", () => {
	it("keeps the default center and frame unhighlighted when no custom slots are passed", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				value: "",
				onChange: () => {},
				onSubmit: () => {},
				placeholder: "Type your message...",
			})
		);

		expect(html).toContain("Type your message...");
		expect(html).toContain('data-composer-frame="default"');
		expect(html).toContain('data-composer-central-block="true"');
		expect(html).toContain('data-composer-editor-viewport="true"');
		expect(html).not.toContain('data-composer-textarea-overlay="true"');
	});

	it("renders a textarea overlay without duplicating the underlying visible textarea content", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				onChange: () => {},
				onSubmit: () => {},
				textareaOverlay: React.createElement(
					"div",
					{ "data-overlay-copy": "true" },
					"Typed reply overlay"
				),
				value:
					"I joined and deployed the allowlist patch to production. Please hard refresh and run a checkout test. I'll stay here while you verify.",
			})
		);

		expect(html).toContain('data-composer-textarea-overlay="true"');
		expect(html).toContain('data-overlay-copy="true"');
		expect(html).toContain("Typed reply overlay");
		expect(html).toContain("caret-transparent");
		expect(html).toContain("placeholder:text-transparent");
		expect(html).toContain("min-h-11");
		expect(html).toContain('data-composer-editor-viewport="true"');
		expect(html).toContain("whitespace-pre-wrap");
		expect(html).toContain("p-3");
	});

	it("renders the shared visibility segmented control when visibility can change", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				onChange: () => {},
				onSubmit: () => {},
				onVisibilityChange: () => {},
				value: "",
				visibility: "private",
			})
		);

		expect(html).toContain('data-slot="segmented-control"');
		expect(html).toContain('aria-label="Message visibility"');
		expect(html).toContain("Reply");
		expect(html).toContain("Private note");
	});

	it("renders compact priority and sentiment controls in the default footer", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				onChange: () => {},
				onPriorityChange: () => {},
				onSentimentChange: () => {},
				onSubmit: () => {},
				priority: "urgent",
				sentiment: "negative",
				value: "",
			})
		);

		expect(html).toContain("Priority: Urgent");
		expect(html).toContain("Sentiment: Negative");
		expect(html).toContain('data-composer-bottom-block="true"');
	});

	it("renders unknown when manual sentiment is cleared", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				onChange: () => {},
				onSentimentChange: () => {},
				onSubmit: () => {},
				sentiment: null,
				value: "",
			})
		);

		expect(html).toContain("Sentiment: Unknown");
	});

	it("supports inline layout mode for centered landing compositions", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				layoutMode: "inline",
				onChange: () => {},
				onSubmit: () => {},
				value: "",
			})
		);

		expect(html).toContain('data-composer-layout-mode="inline"');
	});

	it("lets callers disable textarea autofocus when a demo should stay passive", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				autoFocus: false,
				onChange: () => {},
				onSubmit: () => {},
				value: "",
			})
		);

		expect(html).not.toContain("autofocus");
	});

	it("highlights the frame as soon as any custom slot is present", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				aboveBlock: React.createElement(
					"div",
					{ "data-clarification-slot": "true" },
					"Clarification prompt"
				),
				value: "",
				onChange: () => {},
				onSubmit: () => {},
			})
		);

		expect(html).toContain("Clarification prompt");
		expect(html).toContain('data-composer-frame="highlighted"');
	});

	it("renders a custom central block instead of the default center surface", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				centralBlock: React.createElement(
					"section",
					{ "data-central-slot": "true" },
					"Custom central block"
				),
				value: "",
				onChange: () => {},
				onSubmit: () => {},
				placeholder: "Type your message...",
			})
		);

		expect(html).toContain("Custom central block");
		expect(html).toContain('data-central-slot="true"');
		expect(html).toContain('data-composer-frame="highlighted"');
		expect(html).not.toContain("Type your message...");
	});

	it("renders escalation action in the center while keeping the default footer", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				escalationAction: {
					reason: "Needs a human response",
					onJoin: () => {},
				},
				onChange: () => {},
				onSubmit: () => {},
				placeholder: "Type your message...",
				value: "",
			})
		);

		expect(html).toContain("Join the conversation");
		expect(html).toContain("Needs a human response");
		expect(html).toContain('data-composer-frame="highlighted"');
		expect(html).toContain('data-composer-central-block="true"');
		expect(html).toContain('data-composer-bottom-block="true"');
		expect(html).not.toContain("Type your message...");
	});

	it("prefers active clarification blocks over the embedded escalation block", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				aboveBlock: React.createElement(
					"div",
					{ "data-clarification-topic": "true" },
					"Clarification topic"
				),
				centralBlock: React.createElement(
					"section",
					{ "data-clarification-flow": "true" },
					"Clarification flow"
				),
				bottomBlock: React.createElement(
					"div",
					{ "data-clarification-actions": "true" },
					"Clarification actions"
				),
				escalationAction: {
					reason: "Needs a human response",
					onJoin: () => {},
				},
				onChange: () => {},
				onSubmit: () => {},
				value: "",
			})
		);

		expect(html).toContain("Clarification topic");
		expect(html).toContain("Clarification flow");
		expect(html).toContain("Clarification actions");
		expect(html).not.toContain("Join the conversation");
		expect(html).not.toContain("Needs a human response");
	});

	it("composes the slot identity with keyed custom children", async () => {
		const { getComposerAnimatedSlotKey } = await composerSlotKeyModulePromise;

		expect(
			getComposerAnimatedSlotKey("central-custom", <section key="question" />)
		).toBe("central-custom:question");
		expect(getComposerAnimatedSlotKey("central-custom", <section />)).toBe(
			"central-custom"
		);
	});

	it("renders a custom bottom block instead of the default footer", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				bottomBlock: React.createElement(
					"div",
					{ "data-bottom-slot": "true" },
					"Custom bottom block"
				),
				value: "",
				onChange: () => {},
				onSubmit: () => {},
			})
		);

		expect(html).toContain("Custom bottom block");
		expect(html).toContain('data-bottom-slot="true"');
		expect(html).toContain('data-composer-frame="highlighted"');
		expect(html).not.toContain('data-composer-bottom-block="true"');
	});

	it("exports reusable central and bottom shells for custom showcase layouts", async () => {
		const { ComposerBottomBlock, ComposerCentralBlock } =
			await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(
					ComposerCentralBlock,
					null,
					React.createElement("div", null, "Central shell")
				),
				React.createElement(
					ComposerBottomBlock,
					null,
					React.createElement("div", null, "Bottom shell")
				)
			)
		);

		expect(html).toContain('data-composer-central-block="true"');
		expect(html).toContain('data-composer-bottom-block="true"');
		expect(html).toContain("Central shell");
		expect(html).toContain("Bottom shell");
	});
});
