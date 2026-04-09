import { describe, expect, it } from "bun:test";
import {
	signWebhookPayload,
	verifyWebhookSignature,
} from "./providers/ses/webhook-auth";

describe("SES webhook auth", () => {
	it("accepts a valid signature", () => {
		const timestamp = "1712572800";
		const rawBody = JSON.stringify({ eventType: "email.received" });
		const signature = signWebhookPayload({
			secret: "test-secret",
			timestamp,
			rawBody,
		});

		expect(
			verifyWebhookSignature({
				secret: "test-secret",
				timestamp,
				signature: `sha256=${signature}`,
				rawBody,
				now: 1_712_572_800_000,
			})
		).toBe(true);
	});

	it("rejects stale timestamps", () => {
		const timestamp = "1712572800";
		const rawBody = JSON.stringify({ eventType: "email.received" });
		const signature = signWebhookPayload({
			secret: "test-secret",
			timestamp,
			rawBody,
		});

		expect(
			verifyWebhookSignature({
				secret: "test-secret",
				timestamp,
				signature,
				rawBody,
				now: 1_712_573_500_000,
			})
		).toBe(false);
	});

	it("rejects tampered bodies", () => {
		const timestamp = "1712572800";
		const rawBody = JSON.stringify({ eventType: "email.received" });
		const signature = signWebhookPayload({
			secret: "test-secret",
			timestamp,
			rawBody,
		});

		expect(
			verifyWebhookSignature({
				secret: "test-secret",
				timestamp,
				signature,
				rawBody: JSON.stringify({ eventType: "email.failed" }),
				now: 1_712_572_800_000,
			})
		).toBe(false);
	});
});
