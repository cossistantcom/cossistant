import { describe, expect, it } from "bun:test";
import {
	AUTH_REDIRECT_REASON_SESSION_EXPIRED,
	buildSessionExpiredLoginPath,
	getLoginRedirectReasonMessage,
} from "./redirect";

describe("auth redirect helpers", () => {
	it("builds a session-expired login URL with a safe callback", () => {
		const path = buildSessionExpiredLoginPath("/acme/inbox?thread=123");
		const url = new URL(path, "https://app.example.com");

		expect(url.pathname).toBe("/login");
		expect(url.searchParams.get("reason")).toBe(
			AUTH_REDIRECT_REASON_SESSION_EXPIRED
		);
		expect(url.searchParams.get("callback")).toBe("/acme/inbox?thread=123");
	});

	it("falls back to select for unsafe callbacks", () => {
		const path = buildSessionExpiredLoginPath("https://evil.example.com");
		const url = new URL(path, "https://app.example.com");

		expect(url.searchParams.get("callback")).toBe("/select");
	});

	it("returns the session-expired login notice", () => {
		expect(getLoginRedirectReasonMessage("session-expired")).toBe(
			"Your session expired. Please log in again to continue."
		);
		expect(getLoginRedirectReasonMessage("unknown")).toBeNull();
	});
});
