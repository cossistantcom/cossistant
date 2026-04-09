import { FAKE_MOUSE_CURSOR_ANIMATION_DURATION_S } from "@/components/landing/fake-dashboard/fake-inbox/fake-mouse-cursor";

export const PROMO_BROWSER_INTRO_DOMAIN = "cossistant.com";
export const PROMO_BROWSER_INTRO_TYPING_DELAY_MS = 85;
export const PROMO_BROWSER_INTRO_APPEAR_DELAY_MS = 720;
export const PROMO_BROWSER_INTRO_CURSOR_CLICK_DELAY_MS = Math.round(
	FAKE_MOUSE_CURSOR_ANIMATION_DURATION_S * 1000
);

export type PromoBrowserIntroPhase =
	| "hidden"
	| "appearing"
	| "cursor_enter"
	| "typing"
	| "complete";

export type PromoBrowserIntroPlaybackState = {
	phase: PromoBrowserIntroPhase;
	typedLength: number;
};

export function createPromoBrowserIntroPlaybackState(): PromoBrowserIntroPlaybackState {
	return {
		phase: "hidden",
		typedLength: 0,
	};
}

export function startPromoBrowserIntroAppear(): PromoBrowserIntroPlaybackState {
	return {
		phase: "appearing",
		typedLength: 0,
	};
}

export function startPromoBrowserIntroCursor(): PromoBrowserIntroPlaybackState {
	return {
		phase: "cursor_enter",
		typedLength: 0,
	};
}

export function startPromoBrowserIntroTyping(
	state: PromoBrowserIntroPlaybackState
): PromoBrowserIntroPlaybackState {
	return {
		...state,
		phase: "typing",
	};
}

export function advancePromoBrowserIntroTyping(
	state: PromoBrowserIntroPlaybackState
): PromoBrowserIntroPlaybackState {
	const nextTypedLength = Math.min(
		PROMO_BROWSER_INTRO_DOMAIN.length,
		state.typedLength + 1
	);

	return {
		phase:
			nextTypedLength >= PROMO_BROWSER_INTRO_DOMAIN.length
				? "complete"
				: "typing",
		typedLength: nextTypedLength,
	};
}

export function resetPromoBrowserIntroPlayback(): PromoBrowserIntroPlaybackState {
	return createPromoBrowserIntroPlaybackState();
}

export function getPromoBrowserIntroTypedValue(
	state: PromoBrowserIntroPlaybackState
) {
	return PROMO_BROWSER_INTRO_DOMAIN.slice(0, state.typedLength);
}
