import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SupportProvider, useSupport } from "./provider";
import { processingStoreSingleton } from "./realtime/processing-store";
import { seenStoreSingleton } from "./realtime/seen-store";
import { typingStoreSingleton } from "./realtime/typing-store";

describe("provider controller regression coverage", () => {
	it("creates the support controller inside the provider", () => {
		const source = readFileSync(
			new URL("./provider.tsx", import.meta.url),
			"utf8"
		);

		expect(source).toContain("createSupportController(");
		expect(source).toContain("<SupportControllerContext.Provider");
	});

	it("supports injecting an existing controller into the provider", () => {
		const source = readFileSync(
			new URL("./provider.tsx", import.meta.url),
			"utf8"
		);

		expect(source).toContain("controller?: SupportController");
		expect(source).toContain(
			"const controller = externalController ?? ownedController"
		);
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
});
