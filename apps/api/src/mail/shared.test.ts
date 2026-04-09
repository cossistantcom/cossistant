import { describe, expect, it } from "bun:test";
import { sanitizeIncomingEmailBody } from "./shared/sanitize-incoming-email-body";

describe("mail shared helpers", () => {
	it("prefers the adapter-provided textWithoutSignature body", () => {
		expect(
			sanitizeIncomingEmailBody({
				textBody: "Hello\n\nOn Tue, somebody wrote:\n> quoted",
				textWithoutSignature: "Hello from adapter",
			})
		).toBe("Hello from adapter");
	});

	it("falls back to reply parsing from plain text", () => {
		expect(
			sanitizeIncomingEmailBody({
				textBody: "Hello team\n\nOn Tue, somebody wrote:\n> quoted",
			})
		).toBe("Hello team");
	});
});
