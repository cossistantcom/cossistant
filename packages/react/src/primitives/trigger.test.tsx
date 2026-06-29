import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { SupportTrigger } from "./trigger";

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

function getTrigger(): HTMLButtonElement {
	const trigger = document.querySelector<HTMLButtonElement>(
		'button[aria-haspopup="dialog"]'
	);

	if (!trigger) {
		throw new Error("Could not find trigger button");
	}

	return trigger;
}

describe("SupportTrigger primitive", () => {
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

	it("renders outside SupportProvider with explicit state", () => {
		const html = renderToStaticMarkup(
			<SupportTrigger isOpen={true} isTyping={true} unreadCount={3}>
				{({ isOpen, isTyping, unreadCount }) => (
					<span>
						{isOpen ? "Open" : "Closed"} {isTyping ? "typing" : "idle"}{" "}
						{unreadCount}
					</span>
				)}
			</SupportTrigger>
		);

		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain("Open typing 3");
	});

	it("uses the explicit toggle handler outside SupportProvider", async () => {
		const onToggleOpen = mock(() => {});

		await render(
			<SupportTrigger onToggleOpen={onToggleOpen}>Help</SupportTrigger>
		);

		const { act } = await import("react");
		await act(async () => {
			getTrigger().click();
		});

		expect(onToggleOpen).toHaveBeenCalledTimes(1);
	});
});
