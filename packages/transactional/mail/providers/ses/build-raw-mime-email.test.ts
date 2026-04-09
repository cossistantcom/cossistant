import { describe, expect, it } from "bun:test";
import type { PreparedMail } from "../../core/types";
import { buildRawMimeEmail } from "./build-raw-mime-email";

describe("buildRawMimeEmail", () => {
	it("omits the Bcc header from the raw MIME message", () => {
		const mail: PreparedMail = {
			to: ["to@example.com"],
			cc: ["cc@example.com"],
			bcc: ["hidden@example.com"],
			replyTo: ["reply@example.com"],
			from: "support@example.com",
			subject: "Hello",
			text: "Plain text body",
			html: "<p>HTML body</p>",
		};

		const rawMime = buildRawMimeEmail(mail).toString("utf8");

		expect(rawMime).toContain("To: to@example.com");
		expect(rawMime).toContain("Cc: cc@example.com");
		expect(rawMime).toContain("Reply-To: reply@example.com");
		expect(rawMime).not.toContain("Bcc:");
	});
});
