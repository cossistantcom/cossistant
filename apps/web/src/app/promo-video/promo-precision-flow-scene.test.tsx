import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PromoPrecisionFlowScene } from "./promo-video-page";

// The promo scene reuses the precision stage, which renders the real dashboard
// timeline and reaches for tRPC, react-query and website context.
mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		conversation: {
			translateMessageGroup: {
				mutationOptions: () => ({}),
			},
		},
	}),
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutateAsync: async () => null,
	}),
}));

mock.module("@/contexts/website", () => ({
	useOptionalWebsite: () => null,
}));

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
