import { describe, expect, it } from "bun:test";
import { parseMimeMessage } from "./parse-mime";

describe("parseMimeMessage", () => {
	it("extracts text and html bodies from raw MIME", async () => {
		const rawEmail = [
			"From: Anthony <anthony@example.com>",
			"To: ses-inbound@example.com",
			"Subject: Hello",
			"Message-ID: <test-message@example.com>",
			"MIME-Version: 1.0",
			'Content-Type: multipart/alternative; boundary="boundary"',
			"",
			"--boundary",
			'Content-Type: text/plain; charset="UTF-8"',
			"",
			"Plain body",
			"--boundary",
			'Content-Type: text/html; charset="UTF-8"',
			"",
			"<p>HTML body</p>",
			"--boundary--",
			"",
		].join("\r\n");

		const parsed = await parseMimeMessage(rawEmail);

		expect(parsed.from).toBe("Anthony <anthony@example.com>");
		expect(parsed.to).toEqual(["ses-inbound@example.com"]);
		expect(parsed.subject).toBe("Hello");
		expect(parsed.messageId).toBe("<test-message@example.com>");
		expect(parsed.text).toContain("Plain body");
		expect(parsed.html).toContain("HTML body");
	});
});
