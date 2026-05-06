import { describe, expect, it, mock } from "bun:test";
import type React from "react";
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
const viewModelModulePromise = import("./composer-view-model");

function createInputState() {
	return {
		onChange: () => {},
		onSubmit: () => {},
		placeholder: "Type your message...",
		value: "",
	};
}

describe("buildComposerViewModel", () => {
	it("keeps clarification prompts above the default editor when no flow blocks are active", async () => {
		const { Composer } = await composerModulePromise;
		const { buildConversationComposerViewModel } = await viewModelModulePromise;

		const viewModel = buildConversationComposerViewModel({
			input: createInputState(),
			clarificationPrompt: (
				<div data-clarification-prompt="true">Clarification prompt</div>
			),
		});

		const html = renderToStaticMarkup(<Composer {...viewModel.input} />);

		expect(html).toContain("Clarification prompt");
		expect(html).toContain('data-clarification-prompt="true"');
		expect(html).toContain("Type your message...");
	});

	it("lets clarification flow blocks take precedence over custom slots", async () => {
		const { Composer } = await composerModulePromise;
		const { buildComposerViewModel } = await viewModelModulePromise;

		const viewModel = buildComposerViewModel({
			input: createInputState(),
			slots: {
				aboveBlock: <div data-custom-slot="above">Custom above</div>,
				centralBlock: <div data-custom-slot="central">Custom center</div>,
				bottomBlock: <div data-custom-slot="bottom">Custom bottom</div>,
			},
			clarification: {
				flowBlocks: {
					aboveBlock: <div data-clarification-slot="topic">Topic</div>,
					centralBlock: <div data-clarification-slot="question">Question</div>,
					bottomBlock: <div data-clarification-slot="actions">Actions</div>,
				},
			},
		});

		const html = renderToStaticMarkup(<Composer {...viewModel.input} />);

		expect(html).toContain('data-clarification-slot="topic"');
		expect(html).toContain('data-clarification-slot="question"');
		expect(html).toContain('data-clarification-slot="actions"');
		expect(html).not.toContain("Custom above");
		expect(html).not.toContain("Custom center");
		expect(html).not.toContain("Custom bottom");
	});

	it("passes escalation and limit actions through the same view model", async () => {
		const { buildConversationComposerViewModel } = await viewModelModulePromise;

		const onUpgradeClick = () => {};
		const viewModel = buildConversationComposerViewModel({
			input: createInputState(),
			escalationAction: {
				onJoin: () => {},
				reason: "Human follow-up required",
			},
			limitAction: {
				limit: 120,
				onUpgradeClick,
				used: 120,
				windowDays: 30,
			},
		});

		expect(viewModel.input.escalationAction).toMatchObject({
			reason: "Human follow-up required",
		});
		expect(viewModel.limitAction).toEqual({
			limit: 120,
			onUpgradeClick,
			used: 120,
			windowDays: 30,
		});
	});

	it("passes metadata controls through the conversation composer view model", async () => {
		const { buildConversationComposerViewModel } = await viewModelModulePromise;
		const onPriorityChange = () => {};
		const onSentimentChange = () => {};

		const viewModel = buildConversationComposerViewModel({
			input: {
				...createInputState(),
				priority: "high",
				onPriorityChange,
				isPriorityActionPending: true,
				sentiment: null,
				onSentimentChange,
				isSentimentActionPending: true,
			},
		});

		expect(viewModel.input.priority).toBe("high");
		expect(viewModel.input.onPriorityChange).toBe(onPriorityChange);
		expect(viewModel.input.isPriorityActionPending).toBe(true);
		expect(viewModel.input.sentiment).toBeNull();
		expect(viewModel.input.onSentimentChange).toBe(onSentimentChange);
		expect(viewModel.input.isSentimentActionPending).toBe(true);
	});
});
