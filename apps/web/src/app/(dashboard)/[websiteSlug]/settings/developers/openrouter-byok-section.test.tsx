import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import type React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

type OpenRouterByokSettings = {
	enabled: boolean;
	hasKey: boolean;
	maskedKey: string | null;
	lastConnectionStatus: "unchecked" | "valid" | "invalid";
	lastErrorCode: string | null;
	featureAvailable?: boolean;
};

type DeveloperSettingsData = {
	openRouterByok: OpenRouterByokSettings;
};

let developerSettingsQueryState: {
	data: DeveloperSettingsData | undefined;
	isFetching: boolean;
} = {
	data: undefined,
	isFetching: false,
};

const invalidateCalls: unknown[] = [];

mock.module("@tanstack/react-query", () => ({
	useMutation: (options: {
		onSuccess?: (data: unknown, variables: unknown) => Promise<void> | void;
	}) => ({
		isPending: false,
		mutateAsync: async (variables: unknown) => {
			await options.onSuccess?.(undefined, variables);
		},
	}),
	useQuery: () => developerSettingsQueryState,
	useQueryClient: () => ({
		invalidateQueries: async (args: unknown) => {
			invalidateCalls.push(args);
		},
	}),
}));

mock.module("sonner", () => ({
	toast: {
		error: mock(() => {}),
		success: mock(() => {}),
	},
}));

mock.module("@/components/plan/upgrade-modal", () => ({
	UpgradeModal: ({ open }: { open: boolean }) =>
		open ? <div data-slot="mock-upgrade-modal" /> : null,
}));

mock.module("@/components/ui/badge", () => ({
	Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
		<span {...props} data-slot="mock-badge">
			{children}
		</span>
	),
}));

mock.module("@/components/ui/base-submit-button", () => ({
	BaseSubmitButton: ({
		children,
		isSubmitting,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		isSubmitting?: boolean;
	}) => (
		<button
			{...props}
			data-slot="mock-submit-button"
			data-submitting={String(!!isSubmitting)}
			type={props.type ?? "button"}
		>
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

mock.module("@/components/ui/dialog", () => ({
	Dialog: ({
		children,
		open,
	}: {
		children: React.ReactNode;
		open?: boolean;
	}) => (open ? <div data-slot="mock-dialog">{children}</div> : null),
	DialogContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: React.ReactNode }) => (
		<p>{children}</p>
	),
	DialogFooter: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: React.ReactNode }) => (
		<h2>{children}</h2>
	),
}));

mock.module("@/components/ui/input", () => ({
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input {...props} />
	),
}));

mock.module("@/components/ui/label", () => ({
	Label: ({
		children,
		htmlFor,
	}: React.LabelHTMLAttributes<HTMLLabelElement>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

mock.module("@/components/ui/layout/settings-layout", () => ({
	SettingsRowFooter: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
}));

mock.module("@/components/ui/switch", () => ({
	Switch: ({
		checked,
		disabled,
		id,
		onCheckedChange,
	}: {
		checked: boolean;
		disabled?: boolean;
		id?: string;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			data-slot="mock-switch"
			disabled={disabled}
			id={id}
			onChange={(event) =>
				onCheckedChange((event.target as HTMLInputElement).checked)
			}
			type="checkbox"
		/>
	),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		website: {
			deleteOpenRouterApiKey: {
				mutationOptions: <T,>(options: T) => options,
			},
			developerSettings: {
				queryKey: ({ slug }: { slug: string }) => [
					"website.developerSettings",
					slug,
				],
				queryOptions: ({ slug }: { slug: string }) => ({
					queryKey: ["website.developerSettings", slug],
				}),
			},
			setOpenRouterByokEnabled: {
				mutationOptions: <T,>(options: T) => options,
			},
			upsertOpenRouterApiKey: {
				mutationOptions: <T,>(options: T) => options,
			},
		},
	}),
}));

const modulePromise = import("./openrouter-byok-section");

const installedGlobalKeys = [
	"window",
	"self",
	"document",
	"navigator",
	"Document",
	"DocumentFragment",
	"Element",
	"Event",
	"EventTarget",
	"HTMLElement",
	"HTMLInputElement",
	"MouseEvent",
	"Node",
	"SyntaxError",
	"Text",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(window: Window) {
	(window as Window & { SyntaxError?: typeof Error }).SyntaxError = Error;
	setGlobalValue("window", window);
	setGlobalValue("self", window);
	setGlobalValue("document", window.document);
	setGlobalValue("navigator", window.navigator);
	setGlobalValue("Document", window.Document);
	setGlobalValue("DocumentFragment", window.DocumentFragment);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("HTMLInputElement", window.HTMLInputElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

function createPlanInfo(
	name: "free" | "hobby" | "pro",
	openRouterByok: boolean
) {
	return {
		displayName: name === "pro" ? "Pro" : name === "hobby" ? "Hobby" : "Free",
		features: {
			"openrouter-byok": openRouterByok,
		},
		name,
		price: name === "pro" ? 90 : name === "hobby" ? 30 : undefined,
	} as never;
}

function createSettings(
	overrides: Partial<OpenRouterByokSettings> = {}
): OpenRouterByokSettings {
	return {
		enabled: false,
		featureAvailable: false,
		hasKey: false,
		lastConnectionStatus: "unchecked",
		lastErrorCode: null,
		maskedKey: null,
		...overrides,
	};
}

async function renderSection(params: {
	currentPlan: ReturnType<typeof createPlanInfo>;
	isFetching?: boolean;
	settings?: OpenRouterByokSettings;
}) {
	const { OpenRouterByokSection } = await modulePromise;
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	developerSettingsQueryState = {
		data: params.settings
			? {
					openRouterByok: params.settings,
				}
			: undefined,
		isFetching: params.isFetching ?? false,
	};

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(
			<OpenRouterByokSection
				currentPlan={params.currentPlan}
				organizationId="org_123"
				websiteId="site_123"
				websiteSlug="acme"
			/>
		);
	});
}

describe("OpenRouterByokSection plan gate", () => {
	beforeEach(() => {
		invalidateCalls.length = 0;
		activeRoot = null;
		mountNode = null;
		developerSettingsQueryState = {
			data: undefined,
			isFetching: false,
		};
		windowInstance = new Window({
			url: "https://example.com",
		});
		installDomGlobals(windowInstance);
	});

	afterEach(async () => {
		const { act } = await import("react");

		if (activeRoot) {
			await act(async () => {
				activeRoot?.unmount();
			});
		}

		mountNode?.remove();
		activeRoot = null;
		mountNode = null;
		windowInstance = null;

		for (const key of installedGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
		}
	});

	it("hides the Pro warning for Pro users before developer settings load", async () => {
		await renderSection({
			currentPlan: createPlanInfo("pro", true),
			isFetching: true,
		});

		expect(document.body.textContent).not.toContain(
			"Bring your own OpenRouter key is a Pro feature."
		);
		expect(document.body.textContent).not.toContain("Upgrade to Pro");
	});

	it("hides the Pro warning when currentPlan is entitled but settings are stale", async () => {
		await renderSection({
			currentPlan: createPlanInfo("pro", true),
			settings: createSettings({
				featureAvailable: false,
			}),
		});

		expect(document.body.textContent).not.toContain(
			"Bring your own OpenRouter key is a Pro feature."
		);
		expect(document.body.textContent).not.toContain("Upgrade to Pro");
	});

	it("shows the Pro warning and upgrade CTA without a positive entitlement", async () => {
		await renderSection({
			currentPlan: createPlanInfo("hobby", false),
			settings: createSettings({
				featureAvailable: false,
			}),
		});

		expect(document.body.textContent).toContain(
			"Bring your own OpenRouter key is a Pro feature."
		);
		expect(document.body.textContent).toContain("Upgrade to Pro");
	});
});
