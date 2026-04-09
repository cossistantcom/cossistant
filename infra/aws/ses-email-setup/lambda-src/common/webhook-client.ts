import { signWebhookPayload } from "./signing";

type PostSignedWebhookOptions<TPayload> = {
	url: string;
	secret: string;
	eventName: string;
	payload: TPayload;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
};

export async function postSignedWebhook<TPayload>(
	options: PostSignedWebhookOptions<TPayload>
) {
	const rawBody = JSON.stringify(options.payload);
	const timestamp = `${Math.floor(Date.now() / 1000)}`;
	const signature = signWebhookPayload({
		secret: options.secret,
		timestamp,
		rawBody,
	});
	const response = await (options.fetchImpl ?? fetch)(options.url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-cossistant-event": options.eventName,
			"x-cossistant-timestamp": timestamp,
			"x-cossistant-signature": `sha256=${signature}`,
		},
		body: rawBody,
		signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
	});

	if (!response.ok) {
		throw new Error(
			`Signed webhook request failed with status ${response.status}`
		);
	}
}
