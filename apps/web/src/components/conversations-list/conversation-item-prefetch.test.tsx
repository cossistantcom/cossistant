import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import type React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

mock.module("facehash", () => ({
	Facehash: ({ className }: { className?: string }) => (
		<div className={className}>facehash</div>
	),
}));

mock.module("next/link", () => ({
	default: ({
		children,
		href,
		onMouseEnter,
	}: {
		children: React.ReactNode;
		href: string;
		onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>;
	}) => (
		<a href={href} onMouseEnter={onMouseEnter}>
			{children}
		</a>
	),
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({ fallbackName }: { fallbackName: string }) => (
		<div data-name={fallbackName} data-slot="mock-avatar" />
	),
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => children,
}));

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
	"FocusEvent",
	"HTMLElement",
	"MouseEvent",
	"Node",
	"SVGElement",
	"Text",
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
	setGlobalValue("FocusEvent", window.FocusEvent);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SVGElement", window.SVGElement);
	setGlobalValue("Text", window.Text);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

describe("ConversationItemView detail prefetch events", () => {
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

	it("keeps avatar detail prefetch separate from row hover prefetch", async () => {
		const avatarPrefetchCalls: string[] = [];
		const rowHoverCalls: string[] = [];
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { ConversationItemView } = await import("./conversation-item");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);

		await act(async () => {
			activeRoot?.render(
				<ConversationItemView
					hasUnreadMessage={false}
					href="/acme/inbox/conversation-1"
					isTyping={false}
					lastTimelineContent={<span>Hello</span>}
					onAvatarClick={() => {}}
					onAvatarHoverOrFocus={() => {
						avatarPrefetchCalls.push("avatar");
					}}
					onMouseEnter={() => {
						rowHoverCalls.push("row");
					}}
					visitorName="Gorgeous Wolf"
				/>
			);
		});

		const avatarButton = document.getElementsByTagName("button")[0] ?? null;
		const rowLink = document.getElementsByTagName("a")[0] ?? null;

		expect(avatarButton).not.toBeNull();
		expect(rowLink).not.toBeNull();

		await act(async () => {
			avatarButton?.dispatchEvent(
				new window.MouseEvent("mouseover", { bubbles: true })
			);
			avatarButton?.dispatchEvent(
				new window.FocusEvent("focusin", { bubbles: true })
			);
			rowLink?.dispatchEvent(
				new window.MouseEvent("mouseover", { bubbles: true })
			);
		});

		expect(avatarPrefetchCalls).toEqual(["avatar", "avatar"]);
		expect(rowHoverCalls).toEqual(["row"]);
	});
});
