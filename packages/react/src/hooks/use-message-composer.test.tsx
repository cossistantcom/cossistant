import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { CossistantClient } from "@cossistant/core";
import type * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { getLocalStorageDraftStorageKey } from "./use-local-storage-draft-value";
import { useMessageComposer } from "./use-message-composer";

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
	"CustomEvent",
	"EventTarget",
	"HTMLElement",
	"MutationObserver",
	"Node",
	"StorageEvent",
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
	setGlobalValue("CustomEvent", window.CustomEvent);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("MutationObserver", window.MutationObserver);
	setGlobalValue("Node", window.Node);
	setGlobalValue("StorageEvent", window.StorageEvent);
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

type FakeClientOptions = {
	sendMessage?: () => Promise<unknown>;
};

function createFakeClient({ sendMessage }: FakeClientOptions = {}) {
	return {
		setVisitorTyping: mock(async () => ({})),
		generateUploadUrl: mock(async () => ({
			uploadUrl: "https://uploads.example.com/upload",
			publicUrl: "https://uploads.example.com/file.png",
		})),
		uploadFile: mock(async () => ({})),
		sendMessage: mock(sendMessage ?? (async () => ({ item: { id: "msg_1" } }))),
	} as unknown as CossistantClient;
}

describe("useMessageComposer", () => {
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

	it("restores the message, attachments and persisted draft when the send fails", async () => {
		const draftPersistenceId = "conversation-composer:acme:conv_fail";
		const client = createFakeClient({
			sendMessage: async () => {
				throw new Error("Network error");
			},
		});
		const onError = mock(() => {});
		let hookValue: ReturnType<typeof useMessageComposer> | null = null;

		function Harness() {
			hookValue = useMessageComposer({
				client,
				conversationId: "conv_fail",
				draftPersistenceId,
				onError,
				visitorId: "visitor_1",
			});
			return null;
		}

		await mount(<Harness />);

		const storageKey = getLocalStorageDraftStorageKey(draftPersistenceId);
		const attachment = new File(["binary"], "photo.png", {
			type: "image/png",
		});
		const { act } = await import("react");

		await act(async () => {
			hookValue?.setMessage("Message that must survive a failed send");
		});
		await act(async () => {
			hookValue?.addFiles([attachment]);
		});

		await act(async () => {
			await hookValue?.submit();
		});

		expect(hookValue?.message).toBe("Message that must survive a failed send");
		expect(hookValue?.files).toHaveLength(1);
		expect(hookValue?.files[0]?.name).toBe("photo.png");
		expect(window.localStorage.getItem(storageKey)).toBe(
			"Message that must survive a failed send"
		);
		expect(hookValue?.error?.message).toBe("Network error");
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("clears the composer and persisted draft only after a successful send", async () => {
		const draftPersistenceId = "conversation-composer:acme:conv_ok";
		const client = createFakeClient();
		const onMessageSent = mock(() => {});
		let hookValue: ReturnType<typeof useMessageComposer> | null = null;

		function Harness() {
			hookValue = useMessageComposer({
				client,
				conversationId: "conv_ok",
				draftPersistenceId,
				onMessageSent,
				visitorId: "visitor_1",
			});
			return null;
		}

		await mount(<Harness />);

		const storageKey = getLocalStorageDraftStorageKey(draftPersistenceId);
		const { act } = await import("react");

		await act(async () => {
			hookValue?.setMessage("Message that should be sent");
		});

		expect(window.localStorage.getItem(storageKey)).toBe(
			"Message that should be sent"
		);

		await act(async () => {
			await hookValue?.submit();
		});

		expect(hookValue?.message).toBe("");
		expect(hookValue?.files).toHaveLength(0);
		expect(window.localStorage.getItem(storageKey)).toBeNull();
		expect(hookValue?.error).toBeNull();
		expect(onMessageSent).toHaveBeenCalledWith("conv_ok", "msg_1");
	});
});
