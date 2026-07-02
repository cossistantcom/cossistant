import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
	readFileSync(join(packageDir, "package.json"), "utf8")
) as {
	exports: Record<string, string>;
};

const GRANULAR_SUBPATHS = [
	"./primitives/button",
	"./primitives/command-block-utils",
	"./primitives/conversation-timeline",
	"./primitives/day-separator",
	"./primitives/feedback-comment-input",
	"./primitives/feedback-rating-selector",
	"./primitives/feedback-topic-select",
	"./primitives/multimodal-input",
	"./primitives/router",
	"./primitives/timeline-code-block",
	"./primitives/timeline-command-block",
	"./primitives/timeline-item",
	"./primitives/timeline-item-attachments",
	"./primitives/timeline-item-group",
	"./primitives/timeline-message-layout",
	"./primitives/timeline-read-receipts",
	"./primitives/tool-activity-row",
	"./primitives/trigger",
	"./primitives/window",
	"./hooks/use-create-conversation",
	"./hooks/use-feedback-form",
	"./hooks/use-file-upload",
	"./hooks/use-send-message",
	"./hooks/use-submit-feedback",
	"./internal/hooks",
	"./utils/conversation",
	"./utils/id",
	"./utils/merge-refs",
	"./utils/use-render-element",
];

describe("public export surface", () => {
	it("exposes every granular subpath @cossistant/react documents for deep imports", () => {
		for (const subpath of GRANULAR_SUBPATHS) {
			expect(packageJson.exports[subpath]).toBeDefined();
		}
		expect(packageJson.exports["./hooks/*"]).toBeUndefined();
		expect(packageJson.exports["./primitives/*"]).toBeUndefined();
		expect(packageJson.exports["./utils/*"]).toBeUndefined();
	});

	it("mirrors the matching @cossistant/react subpath from each entry file", () => {
		for (const subpath of GRANULAR_SUBPATHS) {
			const sourcePath = packageJson.exports[subpath];
			if (!sourcePath) {
				throw new Error(`Missing export map entry for ${subpath}`);
			}
			const contents = readFileSync(join(packageDir, sourcePath), "utf8");
			expect(contents).toContain(
				`export * from "@cossistant/react${subpath.slice(1)}";`
			);
		}
	});

	it("starts every entry module with the use client directive", () => {
		for (const [subpath, sourcePath] of Object.entries(packageJson.exports)) {
			if (subpath.endsWith(".css")) {
				continue;
			}
			const contents = readFileSync(join(packageDir, sourcePath), "utf8");
			expect(contents.startsWith('"use client";')).toBe(true);
		}
	});
});
