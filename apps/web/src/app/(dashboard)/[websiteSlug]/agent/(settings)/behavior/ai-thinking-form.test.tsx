import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { GetBehaviorSettingsResponse } from "@cossistant/types";
import { Window } from "happy-dom";
import type React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

const mutationCalls: unknown[] = [];
const invalidateQueriesMock = mock(async () => {});

mock.module("@tanstack/react-query", () => ({
	useMutation: (options: {
		onSuccess?: () => void;
		onError?: (error: Error) => void;
	}) => ({
		isPending: false,
		mutate: (input: unknown) => {
			mutationCalls.push(input);
			options.onSuccess?.();
		},
	}),
	useQueryClient: () => ({
		invalidateQueries: invalidateQueriesMock,
	}),
}));

mock.module("sonner", () => ({
	toast: {
		success: mock(() => {}),
		error: mock(() => {}),
	},
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		aiAgent: {
			getBehaviorSettings: {
				queryKey: (input: unknown) => ["aiAgent.getBehaviorSettings", input],
			},
			updateBehaviorSettings: {
				mutationOptions: (options: unknown) => options,
			},
		},
	}),
}));

mock.module("@/components/ui/base-submit-button", () => ({
	BaseSubmitButton: ({
		children,
		isSubmitting: _isSubmitting,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		isSubmitting?: boolean;
	}) => (
		<button {...props} type={props.type ?? "submit"}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/layout/settings-layout", () => ({
	SettingsRowFooter: ({
		children,
		...props
	}: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

mock.module("@/components/ui/switch", () => ({
	Switch: ({
		checked,
		disabled,
		onCheckedChange,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<button
			aria-pressed={checked ? "true" : "false"}
			data-testid="ai-thinking-switch"
			disabled={disabled}
			onClick={() => onCheckedChange?.(!checked)}
			type="button"
			{...props}
		/>
	),
}));

const modulePromise = Promise.all([
	import("react"),
	import("react-dom/client"),
	import("./ai-thinking-form"),
]);

function createBehaviorSettings(
	overrides: Partial<GetBehaviorSettingsResponse> = {}
): GetBehaviorSettingsResponse {
	return {
		canResolve: true,
		canMarkSpam: true,
		canAssign: true,
		canSetPriority: true,
		canCategorize: true,
		canEscalate: true,
		canRequestKnowledgeClarification: true,
		aiThinkingEnabled: false,
		defaultEscalationUserId: null,
		maxToolInvocationsPerRun: 15,
		autoAnalyzeSentiment: true,
		autoGenerateTitle: true,
		autoCategorize: false,
		aiAgentId: "ai-1",
		...overrides,
	};
}

function createPlanInfo() {
	return {
		aiModels: {
			defaultModelId: "moonshotai/kimi-k2-0905",
			items: [
				{
					id: "openai/gpt-5.5",
					label: "GPT-5.5",
					provider: "OpenAI",
					icon: "star",
					requiresLatestModels: true,
					modelSurchargeCredits: 3.5,
					outageAllowed: false,
					thinkingSupported: true,
					thinkingSurchargeCredits: 3,
					thinkingReasoningMaxTokens: 512,
					selectableForCurrentPlan: true,
				},
				{
					id: "openai/gpt-5.2-chat",
					label: "GPT-5.2 Chat",
					provider: "OpenAI",
					icon: "sparkles",
					requiresLatestModels: true,
					modelSurchargeCredits: 1,
					outageAllowed: false,
					thinkingSupported: false,
					thinkingSurchargeCredits: 0,
					thinkingReasoningMaxTokens: null,
					selectableForCurrentPlan: true,
				},
				{
					id: "openai/gpt-5.5-locked",
					label: "GPT-5.5 Locked",
					provider: "OpenAI",
					icon: "star",
					requiresLatestModels: true,
					modelSurchargeCredits: 3.5,
					outageAllowed: false,
					thinkingSupported: true,
					thinkingSurchargeCredits: 3,
					thinkingReasoningMaxTokens: 512,
					selectableForCurrentPlan: false,
				},
			],
		},
	};
}

async function renderAiThinkingForm(params: {
	initialData: GetBehaviorSettingsResponse;
	modelId: string;
	root?: RootHandle;
	container?: HTMLDivElement;
}) {
	const [{ default: ReactRuntime, act }, { createRoot }, { AiThinkingForm }] =
		await modulePromise;
	const container = params.container ?? document.createElement("div");
	if (!params.container) {
		document.body.appendChild(container);
	}
	const root = params.root ?? (createRoot(container) as RootHandle);

	await act(async () => {
		root.render(
			ReactRuntime.createElement(AiThinkingForm, {
				websiteSlug: "acme",
				aiAgentId: "ai-1",
				modelId: params.modelId,
				initialData: params.initialData,
				planInfo: createPlanInfo() as never,
			})
		);
	});

	await new Promise((resolve) => setTimeout(resolve, 0));

	return {
		container,
		root,
		unmount: () => {
			act(() => {
				root.unmount();
			});
		},
	};
}

function getSwitch(): HTMLButtonElement {
	const switchButton = Array.from(document.getElementsByTagName("button")).find(
		(item) => item.getAttribute("data-testid") === "ai-thinking-switch"
	);
	if (!switchButton) {
		throw new Error("AI Thinking switch not found");
	}
	return switchButton;
}

function getSaveButton(): HTMLButtonElement {
	const button = Array.from(document.getElementsByTagName("button")).find(
		(item) => item.textContent?.includes("Save settings")
	);
	if (!button) {
		throw new Error("Save settings button not found");
	}
	return button as HTMLButtonElement;
}

async function clickButton(button: HTMLButtonElement) {
	const { act } = await import("react");
	await act(async () => {
		button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AiThinkingForm", () => {
	let window: Window;

	beforeEach(() => {
		window = new Window();
		globalThis.window = window as unknown as typeof globalThis.window;
		globalThis.document =
			window.document as unknown as typeof globalThis.document;
		globalThis.HTMLElement =
			window.HTMLElement as unknown as typeof globalThis.HTMLElement;
		Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
			configurable: true,
			value: true,
			writable: true,
		});
		mutationCalls.length = 0;
		invalidateQueriesMock.mockClear();
	});

	afterEach(() => {
		document.body.replaceChildren();
	});

	it("enables the switch for supported models and shows the extra credit cost", async () => {
		const view = await renderAiThinkingForm({
			initialData: createBehaviorSettings({ aiThinkingEnabled: false }),
			modelId: "openai/gpt-5.5",
		});

		expect(document.body.textContent).toContain(
			"Adds 3 credits per primary AI answer on GPT-5.5."
		);
		expect(getSwitch().disabled).toBe(false);
		expect(getSwitch().getAttribute("aria-pressed")).toBe("false");
		expect(getSaveButton().disabled).toBe(true);

		await clickButton(getSwitch());

		expect(getSwitch().getAttribute("aria-pressed")).toBe("true");
		expect(getSaveButton().disabled).toBe(false);
		view.unmount();
	});

	it("shows an inactive disabled state for unsupported models without clearing the saved preference", async () => {
		const view = await renderAiThinkingForm({
			initialData: createBehaviorSettings({ aiThinkingEnabled: true }),
			modelId: "openai/gpt-5.2-chat",
		});

		expect(document.body.textContent).toContain(
			"AI Thinking is not available for this model."
		);
		expect(document.body.textContent).toContain(
			"Your saved preference will become active again when you select a supported model."
		);
		expect(getSwitch().disabled).toBe(true);
		expect(getSwitch().getAttribute("aria-pressed")).toBe("false");
		expect(getSaveButton().disabled).toBe(true);
		view.unmount();
	});

	it("keeps locked models disabled without implying thinking can be used", async () => {
		const view = await renderAiThinkingForm({
			initialData: createBehaviorSettings({ aiThinkingEnabled: true }),
			modelId: "openai/gpt-5.5-locked",
		});

		expect(document.body.textContent).toContain(
			"AI Thinking is unavailable until this model is available on your plan."
		);
		expect(getSwitch().disabled).toBe(true);
		expect(getSwitch().getAttribute("aria-pressed")).toBe("false");
		view.unmount();
	});

	it("reactivates a saved preference when switching back to a supported model", async () => {
		const firstView = await renderAiThinkingForm({
			initialData: createBehaviorSettings({ aiThinkingEnabled: true }),
			modelId: "openai/gpt-5.2-chat",
		});

		expect(getSwitch().disabled).toBe(true);
		expect(getSwitch().getAttribute("aria-pressed")).toBe("false");

		await renderAiThinkingForm({
			initialData: createBehaviorSettings({ aiThinkingEnabled: true }),
			modelId: "openai/gpt-5.5",
			root: firstView.root,
			container: firstView.container,
		});

		expect(getSwitch().disabled).toBe(false);
		expect(getSwitch().getAttribute("aria-pressed")).toBe("true");
		firstView.unmount();
	});
});
