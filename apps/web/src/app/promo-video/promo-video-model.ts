export type PromoSceneId =
	| "browser_intro"
	| "precision_flow"
	| "widget_open"
	| "fake_dashboard"
	| "logo_end";

export type PromoPlaybackState = {
	selectedSceneId: PromoSceneId;
	isPlaying: boolean;
	playToken: number;
	resetToken: number;
};

export const INITIAL_PROMO_PLAYBACK_STATE: PromoPlaybackState = {
	selectedSceneId: "browser_intro",
	isPlaying: false,
	playToken: 0,
	resetToken: 0,
};

export function selectPromoScene(
	state: PromoPlaybackState,
	sceneId: PromoSceneId
): PromoPlaybackState {
	return {
		...state,
		selectedSceneId: sceneId,
		isPlaying: false,
		resetToken: state.resetToken + 1,
	};
}

export function playPromoPlayback(
	state: PromoPlaybackState
): PromoPlaybackState {
	return {
		...state,
		isPlaying: true,
		playToken: state.playToken + 1,
	};
}

export function pausePromoPlayback(
	state: PromoPlaybackState
): PromoPlaybackState {
	return {
		...state,
		isPlaying: false,
	};
}

export function resetPromoPlayback(
	state: PromoPlaybackState
): PromoPlaybackState {
	return {
		...state,
		isPlaying: false,
		resetToken: state.resetToken + 1,
	};
}
