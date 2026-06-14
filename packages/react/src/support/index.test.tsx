import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { SupportProvider, useSupport } from "../provider";
import { createMockSupportController } from "../test-utils/create-mock-support-controller";
import { PENDING_CONVERSATION_ID } from "../utils/id";
import {
	Support,
	type SupportComposerSlotProps,
	type SupportHomePageSlotProps,
	type SupportTimelineSlotProps,
	type SupportTriggerSlotProps,
	useSupportConfig,
	useSupportText,
} from "./index";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

const resizeObserverDisconnectMock = mock(() => {});
const resizeObserverObserveMock = mock((_element: Element) => {});

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;
const SelectorSyntaxError = Error;

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
	"MutationObserver",
	"Node",
	"Text",
	"getComputedStyle",
	"ResizeObserver",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"matchMedia",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

class MockResizeObserver {
	disconnect = resizeObserverDisconnectMock;
	observe = resizeObserverObserveMock;
}

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(window: Window) {
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
	setGlobalValue("MutationObserver", window.MutationObserver);
	setGlobalValue("Node", window.Node);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("ResizeObserver", MockResizeObserver);
	setGlobalValue("requestAnimationFrame", (callback: FrameRequestCallback) =>
		window.setTimeout(() => callback(Date.now()), 0)
	);
	setGlobalValue("cancelAnimationFrame", (id: number) =>
		window.clearTimeout(id)
	);
	setGlobalValue("matchMedia", () => ({
		matches: false,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);

	Object.defineProperty(window, "SyntaxError", {
		configurable: true,
		value: SelectorSyntaxError,
	});
}

async function renderWithSupport(
	node: React.ReactNode,
	controller = createMockSupportController()
) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(
			<SupportProvider controller={controller}>{node}</SupportProvider>
		);
	});

	return controller;
}

function ConfigProbe() {
	const { isOpen } = useSupportConfig();

	return <div data-is-open={String(isOpen)}>config-probe</div>;
}

type ResponsiveAction = "noop-open";

function ResponsiveActionEffect({ action }: { action: ResponsiveAction }) {
	const { open, toggle } = useSupportConfig();

	React.useLayoutEffect(() => {
		if (action === "noop-open") {
			open();
			toggle();
		}
	}, [action, open, toggle]);

	return <div data-has-hooks="true" />;
}

function hasDialogRole(): boolean {
	return document.body.innerHTML.includes('role="dialog"');
}

function findSupportButton(): HTMLElement | null {
	return (
		Array.from(document.getElementsByTagName("button")).find(
			(element) => element.getAttribute("aria-haspopup") === "dialog"
		) ?? null
	);
}

function findDataIsOpen(): string | null {
	return (
		Array.from(document.getElementsByTagName("div"))
			.find((element) => element.hasAttribute("data-is-open"))
			?.getAttribute("data-is-open") ?? null
	);
}

function findByDataSlot(slot: string): HTMLElement | null {
	return document.querySelector(`[data-slot="${slot}"]`);
}

function findByDataPage(page: string): HTMLElement | null {
	return document.querySelector(`[data-page="${page}"]`);
}

function countHomePageCossistantLogos(): number {
	const homePage = findByDataSlot("home-page");

	return Array.from(homePage?.querySelectorAll("title") ?? []).filter(
		(element) => element.textContent === "Cossistant Logo"
	).length;
}

async function navigateController(
	controller: ReturnType<typeof createMockSupportController>,
	options: Parameters<typeof controller.navigate>[0]
) {
	const { act } = await import("react");

	await act(async () => {
		controller.navigate(options);
	});
}

function RuntimeProbe() {
	const { defaultMessages, quickOptions } = useSupport();
	const text = useSupportText();

	return (
		<div
			data-ask-question={text("common.actions.askQuestion")}
			data-default-message={defaultMessages[0]?.content ?? ""}
			data-quick-options={quickOptions.join("|")}
			data-slot="runtime-probe"
		/>
	);
}

function CustomHomeOverride() {
	return <div data-slot="custom-home-override">Custom home override</div>;
}

function TriggerSlot({
	className,
	isOpen,
	isTyping: _isTyping,
	unreadCount,
	toggle,
	...props
}: SupportTriggerSlotProps) {
	return (
		<button {...props} className={className} onClick={toggle} type="button">
			Slot trigger {isOpen ? "open" : "closed"} {unreadCount}
		</button>
	);
}

function HomeSlot({
	className,
	quickOptions,
	"data-page": dataPage,
	"data-slot": dataSlot,
}: SupportHomePageSlotProps) {
	return (
		<div className={className} data-page={dataPage} data-slot={dataSlot}>
			Slot home {quickOptions.join("|")}
		</div>
	);
}

function TimelineSlot({
	className,
	items,
	"data-slot": dataSlot,
}: SupportTimelineSlotProps) {
	return (
		<div className={className} data-slot={dataSlot}>
			Custom timeline {items.length}
		</div>
	);
}

function ComposerSlot({
	className,
	"data-slot": dataSlot,
}: SupportComposerSlotProps) {
	return (
		<div className={className} data-slot={dataSlot}>
			Custom composer
		</div>
	);
}

describe("Support widget", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		windowInstance = new Window({
			url: "https://example.com",
		});
		resizeObserverDisconnectMock.mockReset();
		resizeObserverObserveMock.mockReset();
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

	it("keeps floating content hidden when the widget is closed", async () => {
		await renderWithSupport(
			<Support.Root open={false}>
				<Support.Trigger>Open support</Support.Trigger>
				<Support.Content avoidCollisions={false}>
					<div>Floating body</div>
				</Support.Content>
			</Support.Root>
		);

		expect(document.body.textContent).toContain("Open support");
		expect(document.body.textContent).not.toContain("Floating body");
		expect(hasDialogRole()).toBe(false);
	});

	it("renders the Cossistant logo in the default closed trigger", async () => {
		await renderWithSupport(<Support />);

		expect(findByDataSlot("trigger")?.textContent).toContain("Cossistant Logo");
	});

	it("anchors the default floating trigger to the viewport", async () => {
		await renderWithSupport(<Support />);

		const trigger = findByDataSlot("trigger");

		expect(trigger?.className).toContain("fixed");
		expect(trigger?.className).toContain("right-4");
		expect(trigger?.className).toContain("bottom-4");
		expect(trigger?.className).toContain("z-[9999]");
	});

	it("lets classNames.trigger override the default trigger anchor", async () => {
		await renderWithSupport(
			<Support
				classNames={{ trigger: "absolute right-auto bottom-2 left-2" }}
			/>
		);

		const trigger = findByDataSlot("trigger");

		expect(trigger?.className).toContain("absolute");
		expect(trigger?.className).toContain("right-auto");
		expect(trigger?.className).toContain("bottom-2");
		expect(trigger?.className).toContain("left-2");
		expect(trigger?.className).not.toContain("fixed");
		expect(trigger?.className).not.toContain("right-4");
		expect(trigger?.className).not.toContain("bottom-4");
	});

	it("renders floating content as a dialog when the widget is open", async () => {
		await renderWithSupport(
			<Support.Root open={true}>
				<Support.Trigger>Open support</Support.Trigger>
				<Support.Content avoidCollisions={false}>
					<div>Floating body</div>
				</Support.Content>
			</Support.Root>
		);

		expect(document.body.textContent).toContain("Floating body");
		expect(document.body.innerHTML).toContain('aria-modal="true"');
		expect(hasDialogRole()).toBe(true);
	});

	it("renders responsive mode without a default trigger or dialog semantics", async () => {
		await renderWithSupport(
			<div style={{ height: "480px", width: "360px" }}>
				<Support mode="responsive">
					<Support.Content>
						<div>Responsive body</div>
					</Support.Content>
				</Support>
			</div>
		);

		expect(document.body.textContent).toContain("Responsive body");
		expect(hasDialogRole()).toBe(false);
		expect(findSupportButton()).toBeNull();
		expect(document.body.innerHTML).toContain('data-support-mode="responsive"');
	});

	it("treats responsive mode as open in useSupportConfig", async () => {
		await renderWithSupport(
			<div style={{ height: "480px", width: "360px" }}>
				<Support.Root mode="responsive">
					<Support.Content>
						<ConfigProbe />
					</Support.Content>
				</Support.Root>
			</div>
		);

		expect(findDataIsOpen()).toBe("true");
	});

	it("renders built-in pages from Support.Root with default Support.Content", async () => {
		await renderWithSupport(
			<Support.Root open={true}>
				<Support.Content />
			</Support.Root>
		);

		expect(document.body.textContent).toContain("Ask us a question");
		expect(findByDataSlot("home-page")?.getAttribute("data-page")).toBe("HOME");
	});

	it("does not show the default AI avatar on home when no AI agent is configured", async () => {
		await renderWithSupport(<Support open={true} />);

		expect(countHomePageCossistantLogos()).toBe(1);
	});

	it("shows the AI avatar on home when an AI agent is configured", async () => {
		const controller = createMockSupportController({
			website: {
				description: null,
				domain: "acme.test",
				defaultLanguage: "en",
				id: "site_123",
				lastOnlineAt: null,
				logoUrl: null,
				name: "Acme",
				organizationId: "org_123",
				status: "online",
				availableAIAgents: [
					{
						id: "ai_123",
						image: null,
						name: "Acme AI",
					},
				],
				availableHumanAgents: [],
				visitor: {
					contact: null,
					id: "visitor_123",
					isBlocked: false,
					language: "en",
				},
			},
		});

		await renderWithSupport(<Support open={true} />, controller);

		expect(countHomePageCossistantLogos()).toBe(2);
	});

	it("forwards runtime props through Support", async () => {
		await renderWithSupport(
			<Support
				content={{ "common.actions.askQuestion": "Parlez-nous" }}
				defaultMessages={[
					{
						content: "Bonjour from Support",
						senderType: "team_member",
					},
				]}
				locale="fr"
				open={true}
				quickOptions={["Planifier un appel"]}
			>
				<Support.Content>
					<RuntimeProbe />
				</Support.Content>
			</Support>
		);

		const probe = findByDataSlot("runtime-probe");

		expect(probe?.getAttribute("data-ask-question")).toBe("Parlez-nous");
		expect(probe?.getAttribute("data-default-message")).toBe(
			"Bonjour from Support"
		);
		expect(probe?.getAttribute("data-quick-options")).toBe(
			"Planifier un appel"
		);
	});

	it("forwards runtime props through Support.Root", async () => {
		await renderWithSupport(
			<Support.Root
				content={{ "common.actions.askQuestion": "Parlez-nous aussi" }}
				defaultMessages={[
					{
						content: "Bonjour from Support.Root",
						senderType: "team_member",
					},
				]}
				locale="fr"
				open={true}
				quickOptions={["Comparer les plans"]}
			>
				<Support.Content>
					<RuntimeProbe />
				</Support.Content>
			</Support.Root>
		);

		const probe = findByDataSlot("runtime-probe");

		expect(probe?.getAttribute("data-ask-question")).toBe("Parlez-nous aussi");
		expect(probe?.getAttribute("data-default-message")).toBe(
			"Bonjour from Support.Root"
		);
		expect(probe?.getAttribute("data-quick-options")).toBe(
			"Comparer les plans"
		);
	});

	it("lets customPages replace a built-in page by name in Support.Root", async () => {
		await renderWithSupport(
			<Support.Root
				customPages={[{ component: CustomHomeOverride, name: "HOME" }]}
				open={true}
			>
				<Support.Content />
			</Support.Root>
		);

		expect(document.body.textContent).toContain("Custom home override");
		expect(document.body.textContent).not.toContain("Ask us a question");
	});

	it("keeps top-level Support.Page overrides working when Support.Content is customized", async () => {
		await renderWithSupport(
			<Support open={true}>
				<Support.Content className="custom-content" />
				<Support.Page component={CustomHomeOverride} name="HOME" />
			</Support>
		);

		expect(document.body.textContent).toContain("Custom home override");
		expect(document.body.textContent).not.toContain("Ask us a question");
	});

	it("applies page slots when there is no explicit route override", async () => {
		await renderWithSupport(
			<Support.Root
				open={true}
				quickOptions={["Replace only the first screen"]}
				slots={{ homePage: HomeSlot }}
			>
				<Support.Content />
			</Support.Root>
		);

		expect(document.body.textContent).toContain(
			"Slot home Replace only the first screen"
		);
	});

	it("prefers explicit page overrides over page slots", async () => {
		await renderWithSupport(
			<Support.Root
				customPages={[{ component: CustomHomeOverride, name: "HOME" }]}
				open={true}
				quickOptions={["This should not appear"]}
				slots={{ homePage: HomeSlot }}
			>
				<Support.Content />
			</Support.Root>
		);

		expect(document.body.textContent).toContain("Custom home override");
		expect(document.body.textContent).not.toContain("Slot home");
	});

	it("renders custom trigger slots with merged slotProps and data-state", async () => {
		await renderWithSupport(
			<Support
				slotProps={{ trigger: { className: "slot-trigger" } }}
				slots={{ trigger: TriggerSlot }}
			/>
		);

		const trigger = findByDataSlot("trigger");

		expect(trigger?.textContent).toContain("Slot trigger closed 0");
		expect(trigger?.className).toContain("slot-trigger");
		expect(trigger?.getAttribute("data-state")).toBe("closed");
	});

	it("renders custom timeline and composer slots on the conversation page", async () => {
		const controller = createMockSupportController();

		await renderWithSupport(
			<Support
				open={true}
				slots={{
					composer: ComposerSlot,
					timeline: TimelineSlot,
				}}
			/>,
			controller
		);

		await navigateController(controller, {
			page: "CONVERSATION",
			params: {
				conversationId: PENDING_CONVERSATION_ID,
				initialMessage: "Hello from slots",
			},
		});

		expect(document.body.textContent).toContain("Custom timeline");
		expect(document.body.textContent).toContain("Custom composer");
	});

	it("only applies defaultOpen on the initial uncontrolled mount", async () => {
		const controller = createMockSupportController();
		const { act } = await import("react");

		await renderWithSupport(
			<Support.Root defaultOpen={false}>
				<ConfigProbe />
			</Support.Root>,
			controller
		);

		expect(findDataIsOpen()).toBe("false");

		await act(async () => {
			controller.open();
		});

		expect(findDataIsOpen()).toBe("true");

		await act(async () => {
			activeRoot?.render(
				<SupportProvider controller={controller}>
					<Support.Root defaultOpen={false}>
						<ConfigProbe />
					</Support.Root>
				</SupportProvider>
			);
		});

		expect(findDataIsOpen()).toBe("true");
	});

	it("registers fragment-wrapped compound children", async () => {
		await renderWithSupport(
			<Support.Root open={true}>
				<React.Fragment key="wrapped-support-children">
					<Support.Trigger>Fragment trigger</Support.Trigger>
					<Support.Content>
						<div>Fragment content</div>
					</Support.Content>
				</React.Fragment>
			</Support.Root>
		);

		expect(document.body.textContent).toContain("Fragment trigger");
		expect(document.body.textContent).toContain("Fragment content");
	});

	it("registers fragment-wrapped page overrides", async () => {
		await renderWithSupport(
			<Support open={true}>
				<Support.Content />
				<React.Fragment key="wrapped-support-page">
					<Support.Page component={CustomHomeOverride} name="HOME" />
				</React.Fragment>
			</Support>
		);

		expect(document.body.textContent).toContain("Custom home override");
		expect(document.body.textContent).not.toContain("Ask us a question");
	});

	it("adds stable data-slot, data-state, and data-page hooks to the default UI", async () => {
		await renderWithSupport(<Support open={true} />);

		expect(findByDataSlot("trigger")?.getAttribute("data-state")).toBe("open");
		expect(findByDataSlot("content")?.getAttribute("data-state")).toBe("open");
		expect(findByDataPage("HOME")?.getAttribute("data-slot")).toBe("home-page");
	});

	it("keeps open state inert in responsive mode while conversation navigation still works", async () => {
		const controller = createMockSupportController();
		const renderResponsiveWidget = (action: ResponsiveAction) => (
			<div style={{ height: "480px", width: "360px" }}>
				<Support.Root mode="responsive">
					<Support.Content>
						<ResponsiveActionEffect action={action} />
						<div>Responsive body</div>
					</Support.Content>
				</Support.Root>
			</div>
		);

		await renderWithSupport(renderResponsiveWidget("noop-open"), controller);
		const hasHooks =
			Array.from(document.getElementsByTagName("div"))
				.find((element) => element.hasAttribute("data-has-hooks"))
				?.getAttribute("data-has-hooks") ?? null;

		expect(hasHooks).toBe("true");

		expect(controller.supportStore.getState().config.isOpen).toBe(false);

		controller.navigate({
			page: "CONVERSATION",
			params: {
				conversationId: PENDING_CONVERSATION_ID,
				initialMessage: "Hello from embed",
			},
		});

		expect(controller.supportStore.getState().config.isOpen).toBe(false);
		expect(controller.supportStore.getState().navigation.current).toEqual({
			page: "CONVERSATION",
			params: {
				conversationId: PENDING_CONVERSATION_ID,
				initialMessage: "Hello from embed",
			},
		});

		controller.navigate({
			page: "CONVERSATION",
			params: {
				conversationId: "conv_123",
			},
		});

		expect(controller.supportStore.getState().config.isOpen).toBe(false);
		expect(controller.supportStore.getState().navigation.current).toEqual({
			page: "CONVERSATION",
			params: {
				conversationId: "conv_123",
			},
		});

		const handleSource = readFileSync(
			join(import.meta.dir, "context", "handle.tsx"),
			"utf8"
		);

		expect(handleSource).toContain(
			"openConversation: (conversationId: string) => {"
		);
		expect(handleSource).toContain(
			"startConversation: (initialMessage?: string) => {"
		);
		expect(handleSource).toContain("navigate({");
		expect(handleSource).toContain("open();");
	});

	it("keeps styles opt-in and exposes all shared Tailwind sources", () => {
		const source = readFileSync(join(import.meta.dir, "index.tsx"), "utf8");
		const cssSource = readFileSync(
			join(import.meta.dir, "support.css"),
			"utf8"
		);
		const animationSource = readFileSync(
			join(import.meta.dir, "animations.css"),
			"utf8"
		);

		expect(source).not.toContain('import "./support.css";');
		expect(cssSource).toContain("font-family: var(--co-font-sans);");
		expect(cssSource).toContain("--co-theme-background");
		expect(cssSource).toContain("--background, oklch(99% 0 0)");
		expect(cssSource).toContain(
			'var(--font-sans, "Geist", "Inter", sans-serif)'
		);
		expect(cssSource).toContain('@source "../primitives";');
		expect(cssSource).toContain('@source "../feedback/components";');
		expect(animationSource).toContain(
			'[data-co-spinner][data-co-spinner-variant="orbit"]'
		);
		expect(animationSource).not.toContain(".co-spinner {");
	});

	it("adds a stable root hook without changing the public API", async () => {
		await renderWithSupport(<Support />);

		const root = findByDataSlot("root");

		expect(root).not.toBeNull();
		expect(root?.hasAttribute("data-cossistant-root")).toBe(true);
	});
});
