import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineItemContent } from "./timeline-item";

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
			'import { Cossistant } from "@plasma/react";',
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
			"npm install @plasma/react",
			"```",
		].join("\n");

		const html = renderMessageContent(commandSnippet);

		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain(">npm<");
		expect(html).toContain(">yarn<");
		expect(html).toContain(">pnpm<");
		expect(html).toContain(">bun<");
		expect(html).toContain(">Copy<");
		expect(html).toContain("npm install @plasma/react");
		expect(html).not.toContain("whitespace-pre-wrap");
	});

	it("promotes standalone inline commands to command blocks", () => {
		const html = renderMessageContent("`pnpm add @plasma/react`");

		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain(">npm<");
		expect(html).toContain(">yarn<");
		expect(html).toContain(">pnpm<");
		expect(html).toContain(">bun<");
		expect(html).toContain("npm install @plasma/react");
	});

	it("promotes inline command code inside prose to a command block", () => {
		const html = renderMessageContent(
			"Run `pnpm add @plasma/react` in your terminal."
		);

		expect(html).toContain("Run ");
		expect(html).toContain("in your terminal.");
		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain("npm install @plasma/react");
		expect(html).not.toContain("<code>pnpm add @plasma/react</code>");
	});
});
