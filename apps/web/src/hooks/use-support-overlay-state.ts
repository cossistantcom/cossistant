"use client";

import { parseAsString, useQueryState } from "nuqs";

export const SUPPORT_OVERLAY_PARAM_KEY = "support";
export const SUPPORT_OVERLAY_PARAM_VALUE = "open";

export function useSupportOverlayState() {
	const [supportOverlayParam, setSupportOverlayParam] = useQueryState(
		SUPPORT_OVERLAY_PARAM_KEY,
		parseAsString
	);

	return {
		isOpen: supportOverlayParam === SUPPORT_OVERLAY_PARAM_VALUE,
		openSupportOverlay: () =>
			setSupportOverlayParam(SUPPORT_OVERLAY_PARAM_VALUE),
		closeSupportOverlay: () => setSupportOverlayParam(null),
	};
}
