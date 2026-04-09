import { SESv2Client } from "@aws-sdk/client-sesv2";
import { getSESCredentials, getSESRegion } from "../../core/config";
import type { MailProviderSendResult } from "../../core/types";

let sesClient: SESv2Client | null = null;

export function getSESClient() {
	if (!sesClient) {
		sesClient = new SESv2Client({
			region: getSESRegion(),
			credentials: getSESCredentials(),
		});
	}

	return sesClient;
}

export function getSESNotConfiguredResult(): MailProviderSendResult {
	return {
		data: null,
		error: new Error(
			"SES is selected as the email transport, but SES credentials are not configured."
		),
	};
}
