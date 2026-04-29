import { getSafeRelativeCallbackPath } from "./callback";

export const AUTH_REDIRECT_REASON_SESSION_EXPIRED = "session-expired";

type LoginRedirectOptions = {
	callbackPath?: string | null;
	reason?: typeof AUTH_REDIRECT_REASON_SESSION_EXPIRED;
};

export function buildLoginRedirectPath({
	callbackPath = "/select",
	reason = AUTH_REDIRECT_REASON_SESSION_EXPIRED,
}: LoginRedirectOptions = {}) {
	const searchParams = new URLSearchParams();
	searchParams.set("reason", reason);
	searchParams.set(
		"callback",
		getSafeRelativeCallbackPath(callbackPath, "/select")
	);

	return `/login?${searchParams.toString()}`;
}

export function buildSessionExpiredLoginPath(callbackPath?: string | null) {
	return buildLoginRedirectPath({
		callbackPath,
		reason: AUTH_REDIRECT_REASON_SESSION_EXPIRED,
	});
}

export function getCurrentSafeCallbackPath() {
	if (typeof window === "undefined") {
		return "/select";
	}

	return getSafeRelativeCallbackPath(
		`${window.location.pathname}${window.location.search}`,
		"/select"
	);
}

export function getLoginRedirectReasonMessage(reason: string | null) {
	if (reason === AUTH_REDIRECT_REASON_SESSION_EXPIRED) {
		return "Your session expired. Please log in again to continue.";
	}

	return null;
}
