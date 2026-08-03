import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { MultimodalInput } from "./multimodal-input";

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
	"KeyboardEvent",
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
	setGlobalValue("KeyboardEvent", window.KeyboardEvent);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

async function render(node: React.ReactNode) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(node);
	});
}

function getTextarea(): HTMLTextAreaElement {
	const textarea = document.querySelector<HTMLTextAreaElement>("textarea");

	if (!textarea) {
		throw new Error("Could not find textarea");
	}

	return textarea;
}

async function dispatchEnter(options: { isComposing?: boolean } = {}) {
	const { act } = await import("react");
	const win = windowInstance;

	if (!win) {
		throw new Error("Window is not installed");
	}

	// Focus first so React's input value tracking points at this textarea
	// (also matches real typing) instead of stale state from other test files
	await act(async () => {
		getTextarea().focus();
	});

	const event = new win.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "Enter",
	});

	if (options.isComposing) {
		// happy-dom's KeyboardEventInit doesn't accept isComposing, so set it
		// directly on the native event React exposes as nativeEvent
		Object.defineProperty(event, "isComposing", { value: true });
	}

	await act(async () => {
		getTextarea().dispatchEvent(event);
	});
}

describe("MultimodalInput primitive", () => {
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

	it("submits on plain Enter", async () => {
		const onSubmit = mock(() => {});

		await render(
			<MultimodalInput onChange={() => {}} onSubmit={onSubmit} value="hello" />
		);

		await dispatchEnter();

		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("does not submit while an IME composition is in progress", async () => {
		const onSubmit = mock(() => {});

		await render(
			<MultimodalInput onChange={() => {}} onSubmit={onSubmit} value="かな" />
		);

		await dispatchEnter({ isComposing: true });

		expect(onSubmit).not.toHaveBeenCalled();
	});
});
