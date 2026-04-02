import { describe, expect, it } from "bun:test";
import type { Mention } from "@plasma/tiny-markdown";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MentionPopover } from "./mention-popover";

function renderPopover(results: Mention[]) {
	return renderToStaticMarkup(
		React.createElement(MentionPopover, {
			isActive: true,
			results,
			highlightedIndex: 0,
			isLoading: false,
			caretPosition: { top: 10, left: 10, height: 16 },
			onSelect: () => {},
			anchorRef: { current: null },
		})
	);
}

describe("MentionPopover", () => {
	it("renders tool mentions with an icon and no avatar fallback", () => {
		const html = renderPopover([
			{ id: "setPriority", name: "Set Priority", type: "tool" },
		]);

		expect(html).toContain('data-mention-leading="tool-icon"');
		expect(html).not.toContain('data-slot="avatar"');
	});

	it("renders ai-agent mentions without image using Cossistant logo", () => {
		const html = renderPopover([
			{ id: "ai-1", name: "Support AI", type: "ai-agent" },
		]);

		expect(html).toContain('data-mention-leading="ai-logo"');
		expect(html).toContain("Cossistant Logo");
	});

	it("renders ai-agent mentions with image using avatar", () => {
		const html = renderPopover([
			{
				id: "ai-1",
				name: "Support AI",
				type: "ai-agent",
				avatar: "https://example.com/agent.png",
			},
		]);

		expect(html).toContain('data-mention-leading="avatar"');
		expect(html).toContain('data-slot="avatar"');
		expect(html).not.toContain('data-mention-leading="tool-icon"');
		expect(html).not.toContain('data-mention-leading="ai-logo"');
	});

	it("positions popover using caret top/left style instead of container bottom", () => {
		const html = renderPopover([
			{ id: "setPriority", name: "Set Priority", type: "tool" },
		]);

		expect(html).toContain("position:fixed");
		expect(html).toContain("top:");
		expect(html).toContain("left:");
		expect(html).not.toContain("bottom:");
		expect(html).not.toContain("position:absolute");
	});

	it("uses softened container styling and emphasizes hints for a single result", () => {
		const html = renderPopover([
			{ id: "setPriority", name: "Set Priority", type: "tool" },
		]);

		expect(html).toContain("shadow-sm");
		expect(html).toContain("bg-muted/40");
		expect(html).toContain("text-muted-foreground");
		expect(html).not.toContain("shadow-md");
	});
});
