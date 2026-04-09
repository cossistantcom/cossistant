import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { useMultimodalInput } from "./private/use-multimodal-input";
import {
	getLocalStorageDraftStorageKey,
	useLocalStorageDraftValue,
} from "./use-local-storage-draft-value";

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

describe("draft persistence hooks", () => {
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

	it("hydrates from localStorage and syncs same-window updates across hook instances", async () => {
		const storageKey = getLocalStorageDraftStorageKey("composer:conv_1");
		window.localStorage.setItem(storageKey, "Persisted draft");

		let firstHook: ReturnType<typeof useLocalStorageDraftValue> | null = null;
		let secondHook: ReturnType<typeof useLocalStorageDraftValue> | null = null;

		function Harness() {
			firstHook = useLocalStorageDraftValue({
				id: "composer:conv_1",
				initialValue: "",
			});
			secondHook = useLocalStorageDraftValue({
				id: "composer:conv_1",
				initialValue: "",
			});
			return null;
		}

		await mount(<Harness />);

		expect(firstHook?.value).toBe("Persisted draft");
		expect(secondHook?.value).toBe("Persisted draft");

		const { act } = await import("react");
		await act(async () => {
			firstHook?.setValue("Updated in this tab");
		});

		expect(window.localStorage.getItem(storageKey)).toBe("Updated in this tab");
		expect(secondHook?.value).toBe("Updated in this tab");
	});

	it("responds to cross-tab storage events", async () => {
		let hookValue: ReturnType<typeof useLocalStorageDraftValue> | null = null;

		function Harness() {
			hookValue = useLocalStorageDraftValue({
				id: "composer:conv_2",
				initialValue: "",
			});
			return null;
		}

		await mount(<Harness />);

		const storageKey = getLocalStorageDraftStorageKey("composer:conv_2");
		window.localStorage.setItem(storageKey, "Synced from another tab");

		const { act } = await import("react");
		await act(async () => {
			window.dispatchEvent(
				new window.StorageEvent("storage", {
					key: storageKey,
					newValue: "Synced from another tab",
				})
			);
		});

		expect(hookValue?.value).toBe("Synced from another tab");
	});

	it("keeps the persisted draft while submit is in flight and clears it after success", async () => {
		const draftPersistenceId = "conversation-composer:acme:conv_3";
		let hookValue: ReturnType<typeof useMultimodalInput> | null = null;
		let resolveSubmit: (() => void) | null = null;

		function Harness() {
			hookValue = useMultimodalInput({
				draftPersistenceId,
				onSubmit: async () =>
					new Promise<void>((resolve) => {
						resolveSubmit = resolve;
					}),
			});
			return null;
		}

		await mount(<Harness />);

		const storageKey = getLocalStorageDraftStorageKey(draftPersistenceId);
		const { act } = await import("react");

		await act(async () => {
			hookValue?.setMessage("Reply that should survive a crash");
		});

		expect(window.localStorage.getItem(storageKey)).toBe(
			"Reply that should survive a crash"
		);

		await act(async () => {
			void hookValue?.submit();
		});

		expect(hookValue?.message).toBe("");
		expect(window.localStorage.getItem(storageKey)).toBe(
			"Reply that should survive a crash"
		);

		await act(async () => {
			resolveSubmit?.();
		});

		expect(window.localStorage.getItem(storageKey)).toBeNull();
	});

	it("restores the draft after a failed submit", async () => {
		const draftPersistenceId = "conversation-composer:acme:conv_4";
		let hookValue: ReturnType<typeof useMultimodalInput> | null = null;

		function Harness() {
			hookValue = useMultimodalInput({
				draftPersistenceId,
				onSubmit: async () => {
					throw new Error("Network error");
				},
			});
			return null;
		}

		await mount(<Harness />);

		const storageKey = getLocalStorageDraftStorageKey(draftPersistenceId);
		const { act } = await import("react");

		await act(async () => {
			hookValue?.setMessage("Keep this draft");
		});

		await act(async () => {
			await hookValue?.submit();
		});

		expect(hookValue?.message).toBe("Keep this draft");
		expect(window.localStorage.getItem(storageKey)).toBe("Keep this draft");
		expect(hookValue?.error?.message).toBe("Network error");
	});
});
