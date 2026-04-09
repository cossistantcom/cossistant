import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PromoPrecisionFlowScene } from "./promo-video-page";

describe("PromoPrecisionFlowScene", () => {
	it("renders only the shared precision stage without the landing copy or playback controls", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PromoPrecisionFlowScene
					isPlaying={false}
					playToken={0}
					resetToken={0}
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-promo-precision-stage="true"');
		expect(html).toContain("How do I delete my account?");
		expect(html).not.toContain("How it learns");
		expect(html).not.toContain("Customer asks");
		expect(html).not.toContain("data-precision-step=");
	});
});
