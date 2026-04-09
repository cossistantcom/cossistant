import { randomUUID } from "node:crypto";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
	getSESConfigurationSetName,
	getSESCredentials,
} from "../../core/config";
import { assertPreparedMailSupportedByProvider } from "../../core/provider-capabilities";
import type {
	MailProviderSendOptions,
	MailProviderSendResult,
	MailTransport,
	PreparedMail,
} from "../../core/types";
import { buildRawMimeEmail } from "./build-raw-mime-email";
import { getSESClient, getSESNotConfiguredResult } from "./client";

const SES_BATCH_CONCURRENCY = 5;

async function sendViaSES(
	mail: PreparedMail,
	_options?: MailProviderSendOptions
): Promise<MailProviderSendResult> {
	assertPreparedMailSupportedByProvider("ses", mail);

	if (!getSESCredentials()) {
		return getSESNotConfiguredResult();
	}

	const rawEmail = buildRawMimeEmail(mail);
	const response = await getSESClient().send(
		new SendEmailCommand({
			ConfigurationSetName: getSESConfigurationSetName(),
			Destination: {
				ToAddresses: mail.to,
				CcAddresses: mail.cc,
				BccAddresses: mail.bcc,
			},
			Content: {
				Raw: {
					Data: rawEmail,
				},
			},
		})
	);

	return {
		data: {
			id: response.MessageId ?? randomUUID(),
			messageId: response.MessageId ?? null,
		},
		error: null,
	};
}

async function runWithConcurrency<TInput, TResult>(params: {
	items: TInput[];
	concurrency: number;
	worker: (item: TInput, index: number) => Promise<TResult>;
}) {
	const results = new Array<TResult>(params.items.length);
	let nextIndex = 0;

	await Promise.all(
		Array.from({
			length: Math.min(params.concurrency, params.items.length),
		}).map(async () => {
			while (true) {
				const currentIndex = nextIndex;
				nextIndex += 1;

				if (currentIndex >= params.items.length) {
					return;
				}

				results[currentIndex] = await params.worker(
					params.items[currentIndex] as TInput,
					currentIndex
				);
			}
		})
	);

	return results;
}

export const sesTransport: MailTransport = {
	async send(mail: PreparedMail, options?: MailProviderSendOptions) {
		return await sendViaSES(mail, options);
	},
	async sendBatch(mail: PreparedMail[], options?: MailProviderSendOptions) {
		if (mail.length === 0) {
			return {
				data: null,
				error: null,
			};
		}

		const results = await runWithConcurrency({
			items: mail,
			concurrency: SES_BATCH_CONCURRENCY,
			worker: async (item) => await sendViaSES(item, options),
		});

		const firstError = results.find((result) => result.error);
		if (firstError) {
			return firstError;
		}

		return {
			data: results.map((result) => result.data),
			error: null,
		};
	},
};
