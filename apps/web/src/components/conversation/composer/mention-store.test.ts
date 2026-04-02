import { describe, expect, it } from "bun:test";
import type { Mention } from "@plasma/tiny-markdown";
import {
	convertDisplayToMarkdown,
	formatMentionDisplay,
} from "./mention-store";

describe("mention-store", () => {
	it("serializes tool mentions to mention:tool:<id> markdown", () => {
		const toolMention: Mention = {
			id: "searchKnowledgeBase",
			name: "Search Knowledge Base",
			type: "tool",
		};

		const store = new Map<string, Mention>([[toolMention.name, toolMention]]);
		const input = `Use ${formatMentionDisplay(toolMention)} before answering.`;
		const output = convertDisplayToMarkdown(input, store);

		expect(output).toContain(
			"[@Search Knowledge Base](mention:tool:searchKnowledgeBase)"
		);
	});
});
