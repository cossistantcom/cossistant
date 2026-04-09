import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	INITIAL_PROMO_PLAYBACK_STATE,
	pausePromoPlayback,
	playPromoPlayback,
	resetPromoPlayback,
	selectPromoScene,
} from "./promo-video-model";
import {
	PromoDashboardScene,
	PromoLogoEndScene,
	PromoVideoPage,
} from "./promo-video-page";

describe("promo video playback model", () => {
	it("starts on the browser intro with a paused baseline", () => {
		expect(INITIAL_PROMO_PLAYBACK_STATE).toEqual({
			selectedSceneId: "browser_intro",
			isPlaying: false,
			playToken: 0,
			resetToken: 0,
		});
	});

	it("plays, pauses, resets, and changes scenes through pure state transitions", () => {
		const playingState = playPromoPlayback(INITIAL_PROMO_PLAYBACK_STATE);
		expect(playingState).toEqual({
			selectedSceneId: "browser_intro",
			isPlaying: true,
			playToken: 1,
			resetToken: 0,
		});

		const pausedState = pausePromoPlayback(playingState);
		expect(pausedState).toEqual({
			selectedSceneId: "browser_intro",
			isPlaying: false,
			playToken: 1,
			resetToken: 0,
		});

		const resetState = resetPromoPlayback(pausedState);
		expect(resetState).toEqual({
			selectedSceneId: "browser_intro",
			isPlaying: false,
			playToken: 1,
			resetToken: 1,
		});

		const widgetSceneState = selectPromoScene(resetState, "widget_open");
		expect(widgetSceneState).toEqual({
			selectedSceneId: "widget_open",
			isPlaying: false,
			playToken: 1,
			resetToken: 2,
		});
	});
});

describe("PromoVideoPage", () => {
	it("renders the shared toolbar, 16:9 frame, and browser intro scene by default", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PromoVideoPage />
			</React.StrictMode>
		);

		expect(html).toContain('data-promo-video-toolbar="true"');
		expect(html).toContain('data-promo-video-frame="true"');
		expect(html).toContain('data-promo-scene="browser_intro"');
		expect(html).toContain("Browser intro");
		expect(html).toContain("Clarification flow");
		expect(html).toContain("Widget open");
		expect(html).toContain("Fake dashboard");
		expect(html).toContain("End logo");
	});

	it("opts the promo dashboard scene into the promo-only delete-account scenario", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PromoDashboardScene isPlaying={false} playToken={0} resetToken={0} />
			</React.StrictMode>
		);

		expect(html).toContain(
			'data-promo-dashboard-scenario="promo_delete_account_answered"'
		);
		expect(html).toContain(
			'data-fake-dashboard-scenario="promo_delete_account_answered"'
		);
	});

	it("renders the end logo scene hidden by default until playback starts", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<PromoLogoEndScene isPlaying={false} playToken={0} resetToken={0} />
			</React.StrictMode>
		);

		expect(html).toContain('data-promo-logo-end-scene="true"');
		expect(html).toContain('data-promo-logo-end-state="hidden"');
		expect(html).not.toContain('data-promo-logo-end-mark="true"');
	});
});
