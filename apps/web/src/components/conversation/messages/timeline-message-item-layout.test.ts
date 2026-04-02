import { describe, expect, it } from "bun:test";
import {
	getDashboardMessageBubbleWidthClasses,
	getDashboardMessageContainerWidthClasses,
} from "./timeline-message-item";

describe("timeline message width helpers", () => {
	it("keeps plain text constrained", () => {
		expect(getDashboardMessageContainerWidthClasses("Hello")).toBe(
			"w-fit max-w-full"
		);
		expect(getDashboardMessageBubbleWidthClasses("Hello")).toBe(
			"w-fit max-w-full md:max-w-[420px]"
		);
	});

	it("expands code blocks to full width", () => {
		const codeSnippet = [
			"```tsx",
			"export default function App() {}",
			"```",
		].join("\n");
		expect(getDashboardMessageContainerWidthClasses(codeSnippet)).toBe(
			"w-full max-w-full"
		);
		expect(getDashboardMessageBubbleWidthClasses(codeSnippet)).toBe(
			"w-full max-w-full md:max-w-full"
		);
	});

	it("expands command blocks to full width", () => {
		const commandSnippet = [
			"```bash",
			"npm install @plasma/next @plasma/react",
			"```",
		].join("\n");
		expect(getDashboardMessageContainerWidthClasses(commandSnippet)).toBe(
			"w-full max-w-full"
		);
		expect(getDashboardMessageBubbleWidthClasses(commandSnippet)).toBe(
			"w-full max-w-full md:max-w-full"
		);
	});

	it("expands standalone inline command snippets to full width", () => {
		const commandSnippet = "`bun add @plasma/next @plasma/react`";
		expect(getDashboardMessageContainerWidthClasses(commandSnippet)).toBe(
			"w-full max-w-full"
		);
		expect(getDashboardMessageBubbleWidthClasses(commandSnippet)).toBe(
			"w-full max-w-full md:max-w-full"
		);
	});

	it("expands inline command snippets in prose to full width", () => {
		const message = "Run `bun add @plasma/next @plasma/react` today.";
		expect(getDashboardMessageContainerWidthClasses(message)).toBe(
			"w-full max-w-full"
		);
		expect(getDashboardMessageBubbleWidthClasses(message)).toBe(
			"w-full max-w-full md:max-w-full"
		);
	});
});
