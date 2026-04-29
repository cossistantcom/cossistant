import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { AiAgentResponse } from "@cossistant/types";
import { Window } from "happy-dom";
import type React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

type MockAvatarValue = {
	previewUrl: string;
	url?: string;
	mimeType: string;
	name?: string;
	size?: number;
};

type MockAvatarInputProps = {
	onChange?: (value: MockAvatarValue | null) => void;
	onUploadComplete?: (value: MockAvatarValue) => void;
	value?: MockAvatarValue | string | null;
};

let planInfo: {
	plan: {
		name: "free" | "hobby" | "pro" | "self_hosted";
		displayName: string;
		price?: number;
		features: Record<string, unknown>;
	};
	aiModels: {
		defaultModelId: string;
		items: Array<{ id: string }>;
	};
} | null = null;

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutateAsync: mock(async () => ({})),
	}),
	useQuery: () => ({
		data: planInfo,
		isPending: false,
	}),
	useQueryClient: () => ({
		invalidateQueries: mock(async () => {}),
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		aiAgent: {
			create: { mutationOptions: () => ({}) },
			get: { queryKey: () => ["aiAgent.get"] },
			toggleActive: { mutationOptions: () => ({}) },
			update: { mutationOptions: () => ({}) },
		},
		plan: {
			getPlanInfo: {
				queryOptions: () => ({}),
			},
		},
		upload: {
			createSignedUrl: { mutationOptions: () => ({}) },
		},
	}),
}));

mock.module("@/components/agents/model-select", () => ({
	ModelSelect: ({ label }: { label: string }) => (
		<div data-slot="mock-model-select">{label}</div>
	),
}));

mock.module("@/components/plan/upgrade-modal", () => ({
	UpgradeModal: ({ open }: { open: boolean }) =>
		open ? <div data-slot="mock-upgrade-modal" /> : null,
}));

mock.module("@/components/ui/avatar-input", () => ({
	AvatarInput: ({
		onChange,
		onUploadComplete,
		value,
	}: MockAvatarInputProps) => {
		const nextValue: MockAvatarValue = {
			previewUrl: "https://cdn.example.com/agent-upload.png",
			url: "https://cdn.example.com/agent-upload.png",
			mimeType: "image/png",
			name: "agent-upload.png",
			size: 1024,
		};

		return (
			<div
				data-has-value={value ? "true" : "false"}
				data-slot="mock-avatar-input"
			>
				<button
					data-testid="mock-avatar-upload"
					onClick={() => {
						onChange?.(nextValue);
						onUploadComplete?.(nextValue);
					}}
					type="button"
				>
					Mock upload
				</button>
			</div>
		);
	},
	uploadToPresignedUrl: mock(async () => {}),
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

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props} type={props.type ?? "button"}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/icons", () => ({
	default: ({ name }: { name: string }) => <span data-icon={name} />,
}));

mock.module("@/components/ui/input", () => ({
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input {...props} />
	),
}));

mock.module("@/components/ui/prompt-input-with-mentions", () => ({
	PromptInputWithMentions: ({ label }: { label: string }) => (
		<div data-slot="mock-prompt-input">{label}</div>
	),
}));

mock.module("@/components/ui/radio-group", () => ({
	RadioGroup: ({
		children,
		onValueChange,
		value,
	}: React.HTMLAttributes<HTMLDivElement> & {
		onValueChange?: (value: string) => void;
		value?: string;
	}) => (
		<div data-slot="mock-radio-group" data-value={value}>
			<button
				data-testid="image-mode-default"
				onClick={() => onValueChange?.("default")}
				type="button"
			>
				Default image mode
			</button>
			<button
				data-testid="image-mode-custom"
				onClick={() => onValueChange?.("custom")}
				type="button"
			>
				Custom image mode
			</button>
			{children}
		</div>
	),
	RadioGroupItem: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input {...props} type="radio" />
	),
}));

mock.module("@/components/ui/switch", () => ({
	Switch: ({
		onCheckedChange: _onCheckedChange,
		...props
	}: React.InputHTMLAttributes<HTMLInputElement> & {
		onCheckedChange?: (checked: boolean) => void;
	}) => <input {...props} onChange={() => {}} type="checkbox" />,
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

const modulePromise = Promise.all([
	import("react"),
	import("react-dom/client"),
	import("./ai-agent-form"),
]);

function createPlanInfo(
	name: "free" | "pro",
	customAvatarFeature: boolean
): NonNullable<typeof planInfo> {
	return {
		plan: {
			name,
			displayName: name === "pro" ? "Pro" : "Free",
			features: {
				"custom-ai-agent-avatar": customAvatarFeature,
			},
		},
		aiModels: {
			defaultModelId: "moonshotai/kimi-k2-0905",
			items: [{ id: "moonshotai/kimi-k2-0905" }],
		},
	};
}

function createAgent(
	overrides: Partial<AiAgentResponse> = {}
): AiAgentResponse {
	return {
		id: "01ARYZ6S41TSV4RRFFQ69G5FAW",
		name: "Support AI",
		image: null,
		description: null,
		basePrompt: "You are helpful.",
		model: "moonshotai/kimi-k2-0905",
		temperature: 0.7,
		maxOutputTokens: 1024,
		isActive: true,
		lastUsedAt: null,
		usageCount: 0,
		goals: null,
		createdAt: "2026-04-01T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
		onboardingCompletedAt: "2026-04-01T00:00:00.000Z",
		...overrides,
	};
}

async function renderForm(params: { initialData: AiAgentResponse | null }) {
	const [{ default: ReactRuntime, act }, { createRoot }, { AIAgentForm }] =
		await modulePromise;
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container) as RootHandle;

	await act(async () => {
		root.render(
			ReactRuntime.createElement(AIAgentForm, {
				organizationId: "org-1",
				websiteId: "site-1",
				websiteName: "Acme",
				websiteSlug: "acme",
				initialData: params.initialData,
			})
		);
	});

	await new Promise((resolve) => setTimeout(resolve, 0));

	return {
		container,
		unmount: () => {
			act(() => {
				root.unmount();
			});
		},
	};
}

function getButtonByText(text: string): HTMLButtonElement {
	const button = Array.from(document.getElementsByTagName("button")).find(
		(item) => item.textContent?.includes(text)
	);

	if (!button) {
		throw new Error(`Button not found: ${text}`);
	}

	return button as HTMLButtonElement;
}

function getButtonByTestId(testId: string): HTMLButtonElement {
	const button = Array.from(document.getElementsByTagName("button")).find(
		(item) => item.getAttribute("data-testid") === testId
	);

	if (!button) {
		throw new Error(`Button not found: ${testId}`);
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

describe("AIAgentForm custom avatar plan gate", () => {
	let window: Window;

	beforeEach(() => {
		window = new Window();
		globalThis.window = window as unknown as typeof globalThis.window;
		globalThis.document =
			window.document as unknown as typeof globalThis.document;
		globalThis.File = window.File as unknown as typeof globalThis.File;
		globalThis.HTMLElement =
			window.HTMLElement as unknown as typeof globalThis.HTMLElement;
		Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
			configurable: true,
			value: true,
			writable: true,
		});
		globalThis.getComputedStyle =
			window.getComputedStyle as unknown as typeof globalThis.getComputedStyle;
	});

	afterEach(() => {
		document.body.replaceChildren();
		planInfo = null;
	});

	it("shows an upgrade clue instead of the upload control on non-Pro plans", async () => {
		planInfo = createPlanInfo("free", false);

		const view = await renderForm({ initialData: null });

		expect(document.body.textContent).toContain(
			"Custom AI agent avatars are a Pro feature."
		);
		expect(document.body.textContent).toContain("Upgrade to Pro");
		expect(document.body.innerHTML).not.toContain(
			'data-slot="mock-avatar-input"'
		);
		view.unmount();
	});

	it("shows the avatar upload control for Pro custom avatars", async () => {
		planInfo = createPlanInfo("pro", true);

		const view = await renderForm({
			initialData: createAgent({
				image: "https://cdn.example.com/agent.png",
			}),
		});

		expect(document.body.textContent).not.toContain(
			"Custom AI agent avatars are a Pro feature."
		);
		expect(document.body.innerHTML).toContain('data-slot="mock-avatar-input"');
		view.unmount();
	});

	it("enables saving after uploading a custom avatar for an agent without an image", async () => {
		planInfo = createPlanInfo("pro", true);

		const view = await renderForm({
			initialData: createAgent({ image: null }),
		});

		expect(getButtonByText("Save changes").disabled).toBe(true);

		await clickButton(getButtonByTestId("image-mode-custom"));
		await clickButton(getButtonByTestId("mock-avatar-upload"));

		expect(getButtonByText("Save changes").disabled).toBe(false);
		view.unmount();
	});

	it("enables saving after replacing an existing custom avatar", async () => {
		planInfo = createPlanInfo("pro", true);

		const view = await renderForm({
			initialData: createAgent({
				image: "https://cdn.example.com/original-agent.png",
			}),
		});

		expect(getButtonByText("Save changes").disabled).toBe(true);

		await clickButton(getButtonByTestId("mock-avatar-upload"));

		expect(getButtonByText("Save changes").disabled).toBe(false);
		view.unmount();
	});
});
