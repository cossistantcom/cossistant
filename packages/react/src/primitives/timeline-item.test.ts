import { describe, expect, it } from "bun:test";
import type { TimelineItem as TimelineItemType } from "@cossistant/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineItem, TimelineItemContent } from "./timeline-item";

function renderMessageContent(text: string): string {
	return renderToStaticMarkup(
		React.createElement(TimelineItemContent, {
			text,
			renderMarkdown: true,
		})
	);
}

describe("TimelineItemContent", () => {
	it("preserves multiple blank lines for plain text messages", () => {
		const text = "Line 1\n\n\nLine 4";
		const html = renderMessageContent(text);

		expect(html).toContain("whitespace-pre-wrap");
		expect(html).toContain("break-words");
		expect(html).toContain(text);
		expect(html).not.toContain("<br");
	});

	it("still renders markdown formatting and mention links", () => {
		const markdownHtml = renderMessageContent("**bold**");
		expect(markdownHtml).toContain(
			'<strong class="font-semibold">bold</strong>'
		);
		expect(markdownHtml).not.toContain("whitespace-pre-wrap");

		const mentionHtml = renderMessageContent(
			"[@John](mention:human-agent:123)"
		);
		expect(mentionHtml).toContain('data-mention-type="human-agent"');
		expect(mentionHtml).toContain('data-mention-id="123"');
		expect(mentionHtml).toContain("@John");
		expect(mentionHtml).not.toContain("whitespace-pre-wrap");
	});

	it("renders fenced code blocks with file metadata and copy affordance", () => {
		const codeSnippet = [
			'```tsx title="app/layout.tsx"',
			'import { Cossistant } from "@cossistant/react";',
			"export default function RootLayout() {",
			"  return null;",
			"}",
			"```",
		].join("\n");

		const html = renderMessageContent(codeSnippet);

		expect(html).toContain('data-co-code-block=""');
		expect(html).toContain("app/layout.tsx");
		expect(html).toContain(">TSX<");
		expect(html).toContain(">Copy<");
		expect(html).toContain('class="language-tsx"');
		expect(html).toContain("import { Cossistant } from");
		expect(html).not.toContain("whitespace-pre-wrap");
	});

	it("renders command blocks with package-manager tabs and copy affordance", () => {
		const commandSnippet = [
			"```bash",
			"npm install @cossistant/react",
			"```",
		].join("\n");

		const html = renderMessageContent(commandSnippet);

		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain(">npm<");
		expect(html).toContain(">yarn<");
		expect(html).toContain(">pnpm<");
		expect(html).toContain(">bun<");
		expect(html).toContain(">Copy<");
		expect(html).toContain("npm install @cossistant/react");
		expect(html).not.toContain("whitespace-pre-wrap");
	});

	it("promotes standalone inline commands to command blocks", () => {
		const html = renderMessageContent("`pnpm add @cossistant/react`");

		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain(">npm<");
		expect(html).toContain(">yarn<");
		expect(html).toContain(">pnpm<");
		expect(html).toContain(">bun<");
		expect(html).toContain("npm install @cossistant/react");
	});

	it("promotes inline command code inside prose to a command block", () => {
		const html = renderMessageContent(
			"Run `pnpm add @cossistant/react` in your terminal."
		);

		expect(html).toContain("Run ");
		expect(html).toContain("in your terminal.");
		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain("npm install @cossistant/react");
		expect(html).not.toContain("<code>pnpm add @cossistant/react</code>");
	});
});

function createTimelineItem(
	overrides: Partial<TimelineItemType> = {}
): TimelineItemType {
	const base: TimelineItemType = {
		id: "item-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "message",
		text: "Hello",
		parts: [],
		userId: null,
		visitorId: "visitor-1",
		aiAgentId: null,
		createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		deletedAt: null,
	};

	return { ...base, ...overrides };
}

function renderItem(item: TimelineItemType): string {
	return renderToStaticMarkup(
		React.createElement(TimelineItem, { item }, (props) =>
			React.createElement("span", {
				"data-sender-type": props.senderType,
			})
		)
	);
}

describe("TimelineItem sender resolution", () => {
	it("prefers user sender over ai and visitor ids like getTimelineItemSender", () => {
		const html = renderItem(
			createTimelineItem({
				aiAgentId: "ai-1",
				userId: "user-1",
				visitorId: "visitor-1",
			})
		);

		expect(html).toContain('data-sender-type="human"');
		expect(html).toContain("from human agent");
	});

	it("prefers ai sender over visitor id", () => {
		const html = renderItem(
			createTimelineItem({
				aiAgentId: "ai-1",
				visitorId: "visitor-1",
			})
		);

		expect(html).toContain('data-sender-type="ai"');
		expect(html).toContain("from AI assistant");
	});

	it("resolves visitor-only items as visitor", () => {
		const html = renderItem(createTimelineItem());

		expect(html).toContain('data-sender-type="visitor"');
		expect(html).toContain("from visitor");
	});
});
