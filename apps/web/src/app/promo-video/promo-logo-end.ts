export type PromoLogoEndPlaybackState = {
	isVisible: boolean;
};

export function createPromoLogoEndPlaybackState(): PromoLogoEndPlaybackState {
	return {
		isVisible: false,
	};
}

export function revealPromoLogoEnd(): PromoLogoEndPlaybackState {
	return {
		isVisible: true,
	};
}

export function resetPromoLogoEndPlayback(): PromoLogoEndPlaybackState {
	return createPromoLogoEndPlaybackState();
}
