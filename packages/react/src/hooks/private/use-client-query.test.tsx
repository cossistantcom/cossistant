import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { CossistantClient } from "@cossistant/core";
import type React from "react";
import { Window } from "../../../../../apps/web/node_modules/happy-dom";
import { useClientQuery } from "./use-client-query";

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

const fakeClient = {} as CossistantClient;

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

async function flush() {
	const { act } = await import("react");

	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

describe("useClientQuery", () => {
	beforeEach(() => {
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

	it("does not refetch when a store-derived refetchOnMount flag flips after the first load", async () => {
		let fetchCount = 0;
		let latestData: string | undefined;

		function Harness({ refetchOnMount }: { refetchOnMount: boolean }) {
			const query = useClientQuery<string, void>({
				client: fakeClient,
				queryFn: () => {
					fetchCount += 1;
					return Promise.resolve("data");
				},
				queryKey: "test:double-fetch",
				refetchOnMount,
			});
			latestData = query.data;
			return null;
		}

		await mount(<Harness refetchOnMount={true} />);
		await flush();

		expect(fetchCount).toBe(1);
		expect(latestData).toBe("data");

		// Store now holds data, so the derived flag flips to false. This must
		// not trigger a second, identical network request.
		await rerender(<Harness refetchOnMount={false} />);
		await flush();

		expect(fetchCount).toBe(1);
	});

	it("keeps background fetch failures out of the host app's unhandled rejections", async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			unhandled.push(reason);
		};
		process.on("unhandledRejection", onUnhandled);

		let latestError: Error | null = null;

		function Harness() {
			const query = useClientQuery<string, void>({
				client: fakeClient,
				queryFn: () => Promise.reject(new Error("network down")),
				queryKey: "test:error-containment",
			});
			latestError = query.error;
			return null;
		}

		try {
			await mount(<Harness />);
			await flush();
			// Give the runtime a macrotask to report any escaped rejection.
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(latestError?.message).toBe("network down");
			expect(unhandled).toEqual([]);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	it("does not leak refetch args into fetches triggered by dependency changes", async () => {
		const { act } = await import("react");
		const calls: Array<{ conversationId: string; cursor?: string }> = [];
		// Stable identity across renders, mirroring the memoised baseArgs in
		// useConversationTimelineItems.
		const baseArgs: { cursor?: string } = {};
		let latestRefetch:
			| ((args?: { cursor?: string }) => Promise<string | undefined>)
			| null = null;

		function Harness({ conversationId }: { conversationId: string }) {
			const query = useClientQuery<string, { cursor?: string }>({
				client: fakeClient,
				queryFn: (_instance, args) => {
					calls.push({ conversationId, cursor: args?.cursor });
					return Promise.resolve("page");
				},
				queryKey: `test:timeline:${conversationId}`,
				initialArgs: baseArgs,
				dependencies: [conversationId],
			});
			latestRefetch = query.refetch;
			return null;
		}

		await mount(<Harness conversationId="conv-A" />);
		await flush();

		expect(calls).toEqual([{ conversationId: "conv-A", cursor: undefined }]);

		// Paginate conversation A.
		await act(async () => {
			await latestRefetch?.({ cursor: "cursor-from-conv-A" });
		});

		expect(calls.at(-1)).toEqual({
			conversationId: "conv-A",
			cursor: "cursor-from-conv-A",
		});

		// Switching conversations must fetch with the base args, not with
		// conversation A's pagination cursor.
		await rerender(<Harness conversationId="conv-B" />);
		await flush();

		expect(calls.at(-1)).toEqual({
			conversationId: "conv-B",
			cursor: undefined,
		});
	});

	it("fetches the requested page even when a same-key request is in flight", async () => {
		const { act } = await import("react");
		const calls: Array<string | undefined> = [];
		let resolveFirst: ((value: string) => void) | null = null;
		let latestRefetch:
			| ((args?: { cursor?: string }) => Promise<string | undefined>)
			| null = null;

		function Harness() {
			const query = useClientQuery<string, { cursor?: string }>({
				client: fakeClient,
				queryFn: (_instance, args) => {
					calls.push(args?.cursor);
					if (calls.length === 1) {
						return new Promise<string>((resolve) => {
							resolveFirst = resolve;
						});
					}
					return Promise.resolve("older-page-data");
				},
				queryKey: "test:dedup-bypass",
			});
			latestRefetch = query.refetch;
			return null;
		}

		await mount(<Harness />);

		// The first-page request is still in flight; an explicit pagination
		// refetch must not be deduplicated into it.
		let refetchResult: string | undefined;
		await act(async () => {
			const pending = latestRefetch?.({ cursor: "older-page" });
			resolveFirst?.("page-1");
			refetchResult = await pending;
		});

		expect(calls).toEqual([undefined, "older-page"]);
		expect(refetchResult).toBe("older-page-data");
	});
});
