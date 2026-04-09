import { describe, expect, it } from "bun:test";
import { normalizeSesLifecycleEvents } from "./normalize";

describe("normalizeSesLifecycleEvents", () => {
	it("normalizes SES bounce events", () => {
		const events = normalizeSesLifecycleEvents({
			eventType: "Bounce",
			mail: {
				messageId: "message-123",
				timestamp: "2026-04-08T10:00:00Z",
			},
			bounce: {
				bounceType: "Permanent",
				bounceSubType: "General",
				bouncedRecipients: [
					{
						emailAddress: "team@example.com",
						diagnosticCode: "550 mailbox unavailable",
					},
				],
			},
		});

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			eventType: "email.bounced",
			recipientEmail: "team@example.com",
			messageId: "message-123",
			bounce: {
				type: "Permanent",
				subType: "General",
				message: "550 mailbox unavailable",
			},
		});
	});

	it("normalizes SES delivery events", () => {
		const events = normalizeSesLifecycleEvents({
			eventType: "Delivery",
			mail: {
				messageId: "message-123",
				timestamp: "2026-04-08T10:00:00Z",
			},
			delivery: {
				recipients: ["team@example.com"],
			},
		});

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			eventType: "email.delivered",
			recipientEmail: "team@example.com",
		});
	});
});
