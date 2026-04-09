import { createHmac } from "node:crypto";

export function signWebhookPayload(params: {
	secret: string;
	timestamp: string;
	rawBody: string;
}): string {
	return createHmac("sha256", params.secret)
		.update(`${params.timestamp}.${params.rawBody}`)
		.digest("hex");
}
