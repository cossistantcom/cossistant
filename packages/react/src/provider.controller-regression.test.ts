import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "../../../apps/web/node_modules/happy-dom";
import { SupportProvider, useSupport } from "./provider";
import { processingStoreSingleton } from "./realtime/processing-store";
import { seenStoreSingleton } from "./realtime/seen-store";
import { typingStoreSingleton } from "./realtime/typing-store";
import { createMockSupportController } from "./test-utils/create-mock-support-controller";

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
	"MutationObserver",
	"Node",
	"Text",
	"getComputedStyle",
	"IS_REACT_ACT_ENVIRONMENT",
	"fetch",
] as const;

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(windowInstance: Window, fetchMock: typeof fetch) {
	const previousGlobals = new Map<string, PropertyDescriptor | undefined>();

	for (const key of installedGlobalKeys) {
		previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
	}

	setGlobalValue("window", windowInstance);
	setGlobalValue("self", windowInstance);
	setGlobalValue("document", windowInstance.document);
	setGlobalValue("navigator", windowInstance.navigator);
	setGlobalValue("Document", windowInstance.Document);
	setGlobalValue("DocumentFragment", windowInstance.DocumentFragment);
	setGlobalValue("Element", windowInstance.Element);
	setGlobalValue("Event", windowInstance.Event);
	setGlobalValue("EventTarget", windowInstance.EventTarget);
	setGlobalValue("HTMLElement", windowInstance.HTMLElement);
	setGlobalValue("MutationObserver", windowInstance.MutationObserver);
	setGlobalValue("Node", windowInstance.Node);
	setGlobalValue("Text", windowInstance.Text);
	setGlobalValue(
		"getComputedStyle",
		windowInstance.getComputedStyle.bind(windowInstance)
	);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
	setGlobalValue("fetch", fetchMock);

	Object.defineProperty(windowInstance, "SyntaxError", {
		configurable: true,
		value: Error,
	});

	return () => {
		for (const [key, descriptor] of previousGlobals) {
			if (descriptor) {
				Object.defineProperty(globalThis, key, descriptor);
			} else {
				Reflect.deleteProperty(globalThis, key);
			}
		}
	};
}

function createWebsiteFetchMock(): typeof fetch {
	return async (input) => {
		const url = String(input);

		if (url.includes("/websites")) {
			return new Response(
				JSON.stringify({
					availableAIAgents: [],
					availableHumanAgents: [],
					defaultLanguage: "en",
					description: null,
					domain: "acme.test",
					id: "website_123",
					lastOnlineAt: null,
					logoUrl: null,
					name: "Acme",
					organizationId: "org_123",
					status: "online",
					visitor: {
						contact: null,
						id: "visitor_123",
						isBlocked: false,
						language: "en",
					},
				}),
				{
					headers: {
						"content-type": "application/json",
					},
					status: 200,
				}
			);
		}

		return new Response(JSON.stringify({}), {
			headers: {
				"content-type": "application/json",
			},
			status: 200,
		});
	};
}

describe("provider controller regression coverage", () => {
	it("creates the support controller inside the provider", () => {
		const source = readFileSync(
			new URL("./provider.tsx", import.meta.url),
			"utf8"
		);

		expect(source).toContain("createSupportController(");
		expect(source).toContain("<SupportControllerContext.Provider");
	});

	it("supports injecting an existing controller into the provider at runtime", () => {
		const controller = createMockSupportController();
		const open = () => {};
		const toggle = () => {};
		let support: ReturnType<typeof useSupport> | null = null;

		controller.open = open;
		controller.toggle = toggle;

		function Harness() {
			support = useSupport();
			return null;
		}

		renderToStaticMarkup(
			React.createElement(
				SupportProvider,
				{
					controller,
				},
				React.createElement(Harness)
			)
		);

		expect(support).not.toBeNull();
		expect(support?.open).toBe(open);
		expect(support?.toggle).toBe(toggle);
		expect(support?.website?.id).toBe("site_123");
	});

	it("routes support store access through the controller context", () => {
		const source = readFileSync(
			new URL("./support/store/support-store.ts", import.meta.url),
			"utf8"
		);

		expect(source).toContain("useSupportController()");
		expect(source).not.toContain("const store = createSupportStore");
	});

	it("creates provider-owned clients with the shared realtime stores", () => {
		let client: ReturnType<typeof useSupport>["client"] = null;

		function Harness() {
			client = useSupport().client;
			return null;
		}

		renderToStaticMarkup(
			React.createElement(
				SupportProvider,
				{
					autoConnect: false,
					publicKey: "pk_test_widget",
				},
				React.createElement(Harness)
			)
		);

		expect(client).not.toBeNull();
		expect(client?.processingStore).toBe(processingStoreSingleton);
		expect(client?.seenStore).toBe(seenStoreSingleton);
		expect(client?.typingStore).toBe(typingStoreSingleton);
	});

	it("keeps provider-owned controller subscriptions active through StrictMode effect replay", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const windowInstance = new Window({
			url: "https://example.com",
		});
		const restoreGlobals = installDomGlobals(
			windowInstance,
			createWebsiteFetchMock()
		);
		const mountNode = document.createElement("div");
		const root = createRoot(mountNode) as RootHandle;
		let support: ReturnType<typeof useSupport> | null = null;

		function Harness() {
			const current = useSupport();
			support = current;

			return React.createElement("div", {
				"data-open": String(current.isOpen),
			});
		}

		try {
			document.body.appendChild(mountNode);

			await act(async () => {
				root.render(
					React.createElement(
						React.StrictMode,
						null,
						React.createElement(
							SupportProvider,
							{
								autoConnect: false,
								publicKey: "pk_test_widget",
							},
							React.createElement(Harness)
						)
					)
				);
			});

			expect(
				mountNode.querySelector("[data-open]")?.getAttribute("data-open")
			).toBe("false");

			if (!support) {
				throw new Error("Support context was not captured");
			}

			await act(async () => {
				support.open();
				await Promise.resolve();
				await Promise.resolve();
			});

			expect(
				mountNode.querySelector("[data-open]")?.getAttribute("data-open")
			).toBe("true");
		} finally {
			await act(async () => {
				root.unmount();
			});
			mountNode.remove();
			await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
			restoreGlobals();
		}
	});
});
