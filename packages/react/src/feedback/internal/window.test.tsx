import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type * as React from "react";
import { Window } from "../../../../../apps/web/node_modules/happy-dom";
import { FeedbackWidgetProvider, useFeedbackConfig } from "../context/widget";
import { FeedbackWindow } from "./window";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

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
	"MouseEvent",
	"Node",
	"SyntaxError",
	"Text",
	"getComputedStyle",
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
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

function OpenStateProbe() {
	const { isOpen } = useFeedbackConfig();

	return <div data-open={String(isOpen)} data-slot="open-state" />;
}

async function renderOpenWindow() {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(
			<FeedbackWidgetProvider defaultOpen>
				<OpenStateProbe />
				<button data-slot="outside" type="button">
					Outside
				</button>
				<FeedbackWindow>
					<button data-slot="inside" type="button">
						Inside
					</button>
				</FeedbackWindow>
			</FeedbackWidgetProvider>
		);
		// Let the window's auto-focus timer settle before tests move focus.
		await new Promise((resolve) => setTimeout(resolve, 60));
	});
}

function getBySlot(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);

	if (!element) {
		throw new Error(`Could not find [data-slot="${slot}"]`);
	}

	return element;
}

function dispatchEscape({ prevented = false }: { prevented?: boolean } = {}) {
	const win = window as unknown as {
		KeyboardEvent: new (
			type: string,
			options?: KeyboardEventInit
		) => KeyboardEvent;
		dispatchEvent: (event: Event) => boolean;
	};
	const event = new win.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "Escape",
	});

	if (prevented) {
		event.preventDefault();
	}

	win.dispatchEvent(event);
}

describe("FeedbackWindow escape handling", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
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

	it("closes on Escape when focus is inside the panel", async () => {
		await renderOpenWindow();

		const { act } = await import("react");
		await act(async () => {
			getBySlot("inside").focus();
		});
		await act(async () => {
			dispatchEscape();
		});

		expect(getBySlot("open-state").dataset.open).toBe("false");
	});

	it("ignores Escape when a higher layer already consumed it", async () => {
		await renderOpenWindow();

		const { act } = await import("react");
		await act(async () => {
			getBySlot("inside").focus();
		});
		await act(async () => {
			dispatchEscape({ prevented: true });
		});

		expect(getBySlot("open-state").dataset.open).toBe("true");
	});

	it("ignores Escape when focus is outside the panel", async () => {
		await renderOpenWindow();

		const { act } = await import("react");
		await act(async () => {
			getBySlot("outside").focus();
		});
		await act(async () => {
			dispatchEscape();
		});

		expect(getBySlot("open-state").dataset.open).toBe("true");
	});
});
