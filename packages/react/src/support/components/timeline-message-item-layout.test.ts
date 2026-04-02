import { describe, expect, it } from "bun:test";
import { getSupportMessageWidthClasses } from "./timeline-message-item";

describe("getSupportMessageWidthClasses", () => {
	it("keeps regular text messages constrained", () => {
		const className = getSupportMessageWidthClasses("Hello there");
		expect(className).toBe("max-w-[90%]");
	});

	it("expands fenced code messages to full width", () => {
		const className = getSupportMessageWidthClasses(
			["```tsx", "export default function App() {}", "```"].join("\n")
		);
		expect(className).toBe("w-full max-w-full");
	});

	it("expands command snippets to full width", () => {
		const className = getSupportMessageWidthClasses(
			["```bash", "npm install @plasma/react", "```"].join("\n")
		);
		expect(className).toBe("w-full max-w-full");
	});

	it("expands standalone inline command snippets to full width", () => {
		const className = getSupportMessageWidthClasses(
			"`pnpm add @plasma/react`"
		);
		expect(className).toBe("w-full max-w-full");
	});

	it("expands inline command snippets in prose to full width", () => {
		const className = getSupportMessageWidthClasses(
			"Run `pnpm add @plasma/react` in your terminal."
		);
		expect(className).toBe("w-full max-w-full");
	});
});
