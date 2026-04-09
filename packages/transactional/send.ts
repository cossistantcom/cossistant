import { getMailTransport } from "./mail/core/get-mail-transport";
import { prepareMail } from "./mail/core/prepare-mail";
import type {
	MailBulkSendOptions,
	MailProviderSendOptions,
	MailSendOptions,
} from "./mail/core/types";

export type ResendEmailOptions = MailSendOptions;
export type ResendBulkEmailOptions = MailBulkSendOptions;

function unwrapMailProviderResult<T extends { error: Error | null }>(
	result: T
): T {
	if (result.error) {
		throw result.error;
	}

	return result;
}

export const sendEmail = async (
	options: MailSendOptions,
	providerOptions?: MailProviderSendOptions
) => {
	try {
		const mail = await prepareMail(options);
		return unwrapMailProviderResult(
			await getMailTransport().send(mail, providerOptions)
		);
	} catch (error) {
		console.error("Failed to send email:", error);
		throw error;
	}
};

export const sendBatchEmail = async (
	options: MailBulkSendOptions,
	providerOptions?: MailProviderSendOptions
) => {
	if (options.length === 0) {
		return {
			data: null,
			error: null,
		};
	}

	try {
		const mail = await Promise.all(options.map((entry) => prepareMail(entry)));
		return unwrapMailProviderResult(
			await getMailTransport().sendBatch(mail, providerOptions)
		);
	} catch (error) {
		console.error("Failed to send batch emails:", error);
		throw error;
	}
};

export const sendEmailViaResend = sendEmail;
export const sendBatchEmailViaResend = sendBatchEmail;
