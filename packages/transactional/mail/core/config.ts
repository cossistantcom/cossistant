import {
	ANTHONY_EMAIL,
	VARIANT_TO_FROM_MAP,
} from "../../resend-utils/constants";
import type { EmailTransportProvider } from "./types";

const DEFAULT_EMAIL_TRANSPORT_PROVIDER: EmailTransportProvider = "resend";

/**
 * This flag only selects the transactional transport and the active reply
 * domain for newly sent mail. Resend-specific audience, contact, and
 * unsubscribe helpers intentionally stay outside this switch.
 */
export function getEmailTransportProvider(): EmailTransportProvider {
	const rawProvider =
		process.env.EMAIL_TRANSPORT_PROVIDER?.trim().toLowerCase();

	if (!(rawProvider && rawProvider.length > 0)) {
		return DEFAULT_EMAIL_TRANSPORT_PROVIDER;
	}

	if (rawProvider === "resend" || rawProvider === "ses") {
		return rawProvider;
	}

	throw new Error(
		`Invalid EMAIL_TRANSPORT_PROVIDER value "${rawProvider}". Expected "resend" or "ses".`
	);
}

export function getDefaultFromAddress(variant: "notifications" | "marketing") {
	return VARIANT_TO_FROM_MAP[variant];
}

export function getDefaultReplyToAddress() {
	return ANTHONY_EMAIL;
}

export function getSESConfigurationSetName() {
	return process.env.SES_CONFIGURATION_SET?.trim() || undefined;
}

export function getSESRegion() {
	return process.env.SES_REGION?.trim() || "us-east-1";
}

export function getSESCredentials() {
	const accessKeyId = process.env.SES_ACCESS_KEY_ID?.trim();
	const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY?.trim();

	if (!(accessKeyId && secretAccessKey)) {
		return;
	}

	return {
		accessKeyId,
		secretAccessKey,
	};
}
