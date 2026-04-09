import { afterEach, describe, expect, it } from "bun:test";
import { env } from "@api/env";
import { Hono } from "hono";
import { sesRouters } from "./index";

const originalWebhookSecret = env.SES_WEBHOOK_SECRET;

afterEach(() => {
	env.SES_WEBHOOK_SECRET = originalWebhookSecret;
});

describe("ses routers", () => {
	it("rejects unsigned lifecycle webhooks", async () => {
		env.SES_WEBHOOK_SECRET = "test-secret";

		const app = new Hono();
		app.route("/ses", sesRouters);

		const response = await app.request("http://localhost/ses/webhooks/events", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-cossistant-timestamp": `${Math.floor(Date.now() / 1000)}`,
				"x-cossistant-signature": "sha256=invalid",
			},
			body: JSON.stringify({
				eventType: "email.delivered",
				eventId: "event_123",
				occurredAt: new Date().toISOString(),
				recipientEmail: "teammate@example.com",
			}),
		});

		expect(response.status).toBe(401);
	});
});
