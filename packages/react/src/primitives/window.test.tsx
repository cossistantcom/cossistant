import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SupportWindow } from "./window";

describe("SupportWindow primitive", () => {
	it("renders outside SupportProvider with controlled props", () => {
		const html = renderToStaticMarkup(
			<SupportWindow isOpen={true} onOpenChange={() => {}}>
				{({ isOpen }) => <span>{isOpen ? "Open" : "Closed"}</span>}
			</SupportWindow>
		);

		expect(html).toContain("Open");
		expect(html).toContain('role="dialog"');
	});

	it("stays hidden outside SupportProvider when closed", () => {
		const html = renderToStaticMarkup(
			<SupportWindow isOpen={false} onOpenChange={() => {}}>
				<span>Hidden</span>
			</SupportWindow>
		);

		expect(html).toBe("");
	});

	it("exposes a default accessible name and id", () => {
		const html = renderToStaticMarkup(
			<SupportWindow isOpen={true} onOpenChange={() => {}}>
				<span>Body</span>
			</SupportWindow>
		);

		expect(html).toContain('aria-label="Support"');
		expect(html).toContain('id="cossistant-window"');
	});

	it("lets consumers override the accessible name", () => {
		const html = renderToStaticMarkup(
			<SupportWindow
				aria-label="Chat with us"
				isOpen={true}
				onOpenChange={() => {}}
			>
				<span>Body</span>
			</SupportWindow>
		);

		expect(html).toContain('aria-label="Chat with us"');
		expect(html).not.toContain('aria-label="Support"');
	});
});
