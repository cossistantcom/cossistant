import {
	type SqsEvent,
	unwrapSnsMessagesFromSqsEvent,
} from "../common/sns-sqs";
import { postSignedWebhook } from "../common/webhook-client";
import { normalizeSesLifecycleEvents } from "./normalize";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";
const WEBHOOK_TIMEOUT_MS = Number.parseInt(
	process.env.WEBHOOK_TIMEOUT_MS ?? "15000",
	10
);
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "";

export async function handler(event: SqsEvent) {
	const notifications =
		unwrapSnsMessagesFromSqsEvent<Record<string, unknown>>(event);
	const payloads = notifications.flatMap((notification) =>
		normalizeSesLifecycleEvents(notification)
	);

	if (payloads.length > 0) {
		await postSignedWebhook({
			url: WEBHOOK_URL,
			secret: WEBHOOK_SECRET,
			eventName: "email.lifecycle",
			payload: payloads.length === 1 ? payloads[0] : payloads,
			timeoutMs: WEBHOOK_TIMEOUT_MS,
		});
	}

	return { processed: payloads.length };
}
