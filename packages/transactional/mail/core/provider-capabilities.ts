import type { EmailTransportProvider, PreparedMail } from "./types";

export type MailProviderCapabilities = {
	supportsScheduledSend: boolean;
	supportsProviderTags: boolean;
};

export const MAIL_PROVIDER_CAPABILITIES: Record<
	EmailTransportProvider,
	MailProviderCapabilities
> = {
	resend: {
		supportsScheduledSend: true,
		supportsProviderTags: true,
	},
	ses: {
		supportsScheduledSend: false,
		supportsProviderTags: false,
	},
};

export function getMailProviderCapabilities(
	provider: EmailTransportProvider
): MailProviderCapabilities {
	return MAIL_PROVIDER_CAPABILITIES[provider];
}

export function assertPreparedMailSupportedByProvider(
	provider: EmailTransportProvider,
	mail: PreparedMail
) {
	const capabilities = getMailProviderCapabilities(provider);

	if (mail.scheduledAt && !capabilities.supportsScheduledSend) {
		throw new Error(
			`${provider.toUpperCase()} transport does not support scheduled sends in this rollout.`
		);
	}

	if (mail.tags && mail.tags.length > 0 && !capabilities.supportsProviderTags) {
		throw new Error(
			`${provider.toUpperCase()} transport does not support provider tags in this rollout.`
		);
	}
}
