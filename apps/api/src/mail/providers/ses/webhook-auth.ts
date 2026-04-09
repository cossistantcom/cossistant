import { createHmac, timingSafeEqual } from "node:crypto";

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

export function signWebhookPayload(params: {
	secret: string;
	timestamp: string;
	rawBody: string;
}): string {
	return createHmac("sha256", params.secret)
		.update(`${params.timestamp}.${params.rawBody}`)
		.digest("hex");
}

export function verifyWebhookSignature(params: {
	secret: string;
	timestamp: string | null;
	signature: string | null;
	rawBody: string;
	now?: number;
}): boolean {
	if (!(params.secret && params.timestamp && params.signature)) {
		return false;
	}

	const normalizedTimestamp = normalizeTimestampToMs(params.timestamp);

	if (normalizedTimestamp === null) {
		return false;
	}

	const now = params.now ?? Date.now();
	if (Math.abs(now - normalizedTimestamp) > FIVE_MINUTES_IN_MS) {
		return false;
	}

	const expectedSignature = signWebhookPayload({
		secret: params.secret,
		timestamp: params.timestamp,
		rawBody: params.rawBody,
	});
	const providedSignature = normalizeSignature(params.signature);

	if (!providedSignature) {
		return false;
	}

	const expectedBuffer = Buffer.from(expectedSignature, "hex");
	const providedBuffer = Buffer.from(providedSignature, "hex");

	if (expectedBuffer.length !== providedBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, providedBuffer);
}

function normalizeSignature(signatureHeader: string): string | null {
	const normalized = signatureHeader.trim();

	if (!normalized) {
		return null;
	}

	return normalized.startsWith("sha256=")
		? normalized.slice("sha256=".length)
		: normalized;
}

function normalizeTimestampToMs(timestamp: string): number | null {
	const parsed = Number.parseInt(timestamp, 10);

	if (!Number.isFinite(parsed)) {
		return null;
	}

	return parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
}
