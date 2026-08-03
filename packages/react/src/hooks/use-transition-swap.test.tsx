import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { useTransitionSwap } from "./use-transition-swap";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;

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
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

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
	setGlobalValue("requestAnimationFrame", (callback: FrameRequestCallback) =>
		window.setTimeout(() => callback(Date.now()), 0)
	);
	setGlobalValue("cancelAnimationFrame", (id: number) =>
		window.clearTimeout(id)
	);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

const EXIT_DURATION = 20;

describe("useTransitionSwap", () => {
	beforeEach(() => {
		windowInstance = new Window({ url: "https://example.com" });
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

	async function setup() {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");

		let result: ReturnType<typeof useTransitionSwap<string>> = {
			displayedKey: "",
			phase: "enter",
		};

		function Harness({ activeKey }: { activeKey: string }) {
			result = useTransitionSwap(activeKey, EXIT_DURATION);
			return null;
		}

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);

		const renderKey = async (key: string) => {
			await act(async () => {
				activeRoot?.render(<Harness activeKey={key} />);
			});
		};

		const waitForSwap = async () => {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, EXIT_DURATION * 3));
			});
		};

		return { renderKey, waitForSwap, getResult: () => result };
	}

	it("swaps to the new key after the exit duration", async () => {
		const { renderKey, waitForSwap, getResult } = await setup();

		await renderKey("chat");
		expect(getResult()).toEqual({ displayedKey: "chat", phase: "enter" });

		await renderKey("typing");
		expect(getResult().phase).toBe("exit");

		await waitForSwap();
		expect(getResult()).toEqual({ displayedKey: "typing", phase: "enter" });
	});

	it("recovers to the enter phase when the key toggles back before the swap fires", async () => {
		const { renderKey, waitForSwap, getResult } = await setup();

		await renderKey("chat");
		// Toggle away and back within the exit duration
		await renderKey("typing");
		await renderKey("chat");

		await waitForSwap();
		expect(getResult()).toEqual({ displayedKey: "chat", phase: "enter" });
	});
});
