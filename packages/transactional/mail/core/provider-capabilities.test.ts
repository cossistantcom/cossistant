import { describe, expect, it } from "bun:test";
import {
	assertPreparedMailSupportedByProvider,
	getMailProviderCapabilities,
} from "./provider-capabilities";
import type { PreparedMail } from "./types";

const baseMail: PreparedMail = {
	to: ["person@example.com"],
	from: "support@example.com",
	subject: "Hello",
	text: "Hello from Cossistant",
};

describe("mail provider capabilities", () => {
	it("keeps resend and ses differences in one shared source of truth", () => {
		expect(getMailProviderCapabilities("resend")).toEqual({
			supportsScheduledSend: true,
			supportsProviderTags: true,
		});

		expect(getMailProviderCapabilities("ses")).toEqual({
			supportsScheduledSend: false,
			supportsProviderTags: false,
		});
	});

	it("allows resend-specific capability flags on resend", () => {
		expect(() =>
			assertPreparedMailSupportedByProvider("resend", {
				...baseMail,
				scheduledAt: new Date().toISOString(),
				tags: [{ name: "source", value: "docs-test" }],
			})
		).not.toThrow();
	});

	it("rejects scheduled sends on ses with a clear error", () => {
		expect(() =>
			assertPreparedMailSupportedByProvider("ses", {
				...baseMail,
				scheduledAt: new Date().toISOString(),
			})
		).toThrow(
			"SES transport does not support scheduled sends in this rollout."
		);
	});

	it("rejects provider tags on ses with a clear error", () => {
		expect(() =>
			assertPreparedMailSupportedByProvider("ses", {
				...baseMail,
				tags: [{ name: "source", value: "docs-test" }],
			})
		).toThrow("SES transport does not support provider tags in this rollout.");
	});
});
