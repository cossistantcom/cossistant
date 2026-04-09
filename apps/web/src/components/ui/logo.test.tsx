import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LogoTextSVG } from "./logo";

describe("LogoTextSVG", () => {
	it("keeps the eye cutouts transparent by default", () => {
		const html = renderToStaticMarkup(<LogoTextSVG />);

		expect(html).toContain('fill="transparent"');
	});

	it("supports overriding the eye fill for promo scenes", () => {
		const html = renderToStaticMarkup(
			<LogoTextSVG eyeFill="var(--background)" />
		);

		expect(html).toContain('fill="var(--background)"');
		expect(html).not.toContain('fill="transparent"');
	});
});
