import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ReactSDK from "./index";

describe("public export surface", () => {
	it("does not leak private hook helpers from the package root", () => {
		expect("useClientQuery" in ReactSDK).toBe(false);
		expect("useDefaultMessages" in ReactSDK).toBe(false);
		expect("useGroupedMessages" in ReactSDK).toBe(false);
		expect("useMultimodalInput" in ReactSDK).toBe(false);
	});

	it("keeps the package export map explicit for supported deep imports", () => {
		const packageJson = JSON.parse(
			readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")
		) as {
			exports: Record<string, string>;
		};

		expect(packageJson.exports["./internal/hooks"]).toBe(
			"./src/internal/hooks.ts"
		);
		expect(packageJson.exports["./lazy-support"]).toBe(
			"./src/lazy-support.tsx"
		);
		expect(packageJson.exports["./hooks/use-create-conversation"]).toBe(
			"./src/hooks/use-create-conversation.ts"
		);
		expect(packageJson.exports["./hooks/use-feedback-form"]).toBe(
			"./src/hooks/use-feedback-form.ts"
		);
		expect(packageJson.exports["./hooks/use-file-upload"]).toBe(
			"./src/hooks/use-file-upload.ts"
		);
		expect(packageJson.exports["./hooks/use-send-message"]).toBe(
			"./src/hooks/use-send-message.ts"
		);
		expect(packageJson.exports["./hooks/use-submit-feedback"]).toBe(
			"./src/hooks/use-submit-feedback.ts"
		);
		expect(packageJson.exports["./primitives/button"]).toBe(
			"./src/primitives/button.tsx"
		);
		expect(packageJson.exports["./utils/use-render-element"]).toBe(
			"./src/utils/use-render-element.tsx"
		);
		expect(packageJson.exports["./hooks/*"]).toBeUndefined();
		expect(packageJson.exports["./primitives/*"]).toBeUndefined();
		expect(packageJson.exports["./utils/*"]).toBeUndefined();
	});
});
