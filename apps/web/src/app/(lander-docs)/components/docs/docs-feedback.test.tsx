import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DocsFeedback } from "./docs-feedback";

describe("DocsFeedback", () => {
	it("renders keyboard-sized feedback actions with page context", () => {
		const html = renderToStaticMarkup(
			<DocsFeedback pageTitle="API Keys" pageUrl="/docs/quickstart/api-keys" />
		);

		expect(html).toContain("Was this page helpful?");
		expect(html).toContain("min-h-11");
		expect(html).toContain("documentation");
		expect(html).toContain("API+Keys");
		expect(html).toContain("%2Fdocs%2Fquickstart%2Fapi-keys");
		expect(html).toContain("Needs improvement");
	});
});
