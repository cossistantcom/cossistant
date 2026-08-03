import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type * as React from "react";
import { Window } from "../../../../../apps/web/node_modules/happy-dom";
import { FeedbackWidgetProvider, useFeedbackConfig } from "../context/widget";
import { FeedbackTriggerPrimitive } from "./trigger";

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

async function renderWithWidgetProvider(node: React.ReactNode) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(<FeedbackWidgetProvider>{node}</FeedbackWidgetProvider>);
	});
}

function OpenStateProbe() {
	const { isOpen } = useFeedbackConfig();

	return <div data-open={String(isOpen)} data-slot="open-state" />;
}

function getBySlot(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);

	if (!element) {
		throw new Error(`Could not find [data-slot="${slot}"]`);
	}

	return element;
}

describe("FeedbackTriggerPrimitive", () => {
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

	it("composes a consumer onClick with the internal toggle", async () => {
		const onClick = mock(() => {});

		await renderWithWidgetProvider(
			<>
				<FeedbackTriggerPrimitive onClick={onClick}>
					Open feedback
				</FeedbackTriggerPrimitive>
				<OpenStateProbe />
			</>
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("feedback-trigger").click();
		});

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(getBySlot("open-state").dataset.open).toBe("true");
	});

	it("skips the toggle when the consumer prevents default", async () => {
		await renderWithWidgetProvider(
			<>
				<FeedbackTriggerPrimitive onClick={(event) => event.preventDefault()}>
					Open feedback
				</FeedbackTriggerPrimitive>
				<OpenStateProbe />
			</>
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("feedback-trigger").click();
		});

		expect(getBySlot("open-state").dataset.open).toBe("false");
	});
});
