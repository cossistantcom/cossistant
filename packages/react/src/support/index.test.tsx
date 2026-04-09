import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { SupportProvider } from "../provider";
import { createMockSupportController } from "../test-utils/create-mock-support-controller";
import { PENDING_CONVERSATION_ID } from "../utils/id";
import { Support, useSupportConfig } from "./index";

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

		expect(source).not.toContain('import "./support.css";');
		expect(cssSource).toContain('@source "../primitives";');
		expect(cssSource).toContain('@source "../feedback/components";');
	});
});
