import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { PENDING_CONVERSATION_ID } from "../utils/id";
import {
	type UseConversationLifecycleReturn,
	useConversationLifecycle,
} from "./use-conversation-lifecycle";

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

let latest: UseConversationLifecycleReturn | null = null;

function Harness({
	initialConversationId,
	onConversationCreated,
}: {
	initialConversationId?: string;
	onConversationCreated?: (conversationId: string) => void;
}) {
	latest = useConversationLifecycle({
		initialConversationId,
		onConversationCreated,
	});
	return null;
}

async function mount(node: React.ReactNode) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(node);
	});
}

async function rerender(node: React.ReactNode) {
	const { act } = await import("react");

	await act(async () => {
		activeRoot?.render(node);
	});
}

describe("useConversationLifecycle", () => {
	beforeEach(() => {
		windowInstance = new Window({
			url: "https://example.com",
		});
		installDomGlobals(windowInstance);
		latest = null;
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

	it("resyncs when the initialConversationId prop changes without unmounting", async () => {
		await mount(<Harness initialConversationId="conv-a" />);
		expect(latest?.conversationId).toBe("conv-a");

		await rerender(<Harness initialConversationId="conv-b" />);
		expect(latest?.conversationId).toBe("conv-b");
		expect(latest?.realConversationId).toBe("conv-b");
	});

	it("keeps a created conversation id across re-renders with an unchanged prop", async () => {
		const { act } = await import("react");

		await mount(<Harness initialConversationId={PENDING_CONVERSATION_ID} />);

		await act(async () => {
			latest?.setConversationId("conv-created");
		});
		expect(latest?.conversationId).toBe("conv-created");

		await rerender(<Harness initialConversationId={PENDING_CONVERSATION_ID} />);
		expect(latest?.conversationId).toBe("conv-created");
	});

	it("fires onConversationCreated once for the pending -> real transition", async () => {
		const { act } = await import("react");
		const created: string[] = [];

		await mount(
			<Harness
				onConversationCreated={(conversationId) => {
					created.push(conversationId);
				}}
			/>
		);
		expect(latest?.isPending).toBe(true);

		await act(async () => {
			latest?.setConversationId("conv-real");
		});
		expect(created).toEqual(["conv-real"]);
		expect(latest?.isPending).toBe(false);

		await act(async () => {
			latest?.setConversationId("conv-real-2");
		});
		expect(created).toEqual(["conv-real"]);
	});
});
