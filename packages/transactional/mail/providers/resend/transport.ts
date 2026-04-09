import type { CreateBatchOptions } from "resend";
import { resend } from "../../../resend-utils";
import type {
	MailProviderSendOptions,
	MailProviderSendResult,
	MailTransport,
	PreparedMail,
} from "../../core/types";
import { toResendEmailOptions } from "./to-email-options";

function getUninitializedClientResult(message: string): MailProviderSendResult {
	return {
		data: null,
		error: new Error(message),
	};
}

export const resendTransport: MailTransport = {
	async send(mail: PreparedMail, options?: MailProviderSendOptions) {
		if (!resend) {
			return getUninitializedClientResult("Resend client not initialized");
		}

		return await resend.emails.send(
			toResendEmailOptions(mail),
			options?.idempotencyKey
				? { idempotencyKey: options.idempotencyKey }
				: undefined
		);
	},
	async sendBatch(mail: PreparedMail[], options?: MailProviderSendOptions) {
		if (!resend) {
			return getUninitializedClientResult("Resend client not initialized");
		}

		if (mail.length === 0) {
			return {
				data: null,
				error: null,
			};
		}

		const payload: CreateBatchOptions = mail.map(toResendEmailOptions);
		return await resend.batch.send(
			payload,
			options?.idempotencyKey
				? { idempotencyKey: options.idempotencyKey }
				: undefined
		);
	},
};
