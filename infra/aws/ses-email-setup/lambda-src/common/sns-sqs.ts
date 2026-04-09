export type SqsEventRecord = {
	body: string;
};

export type SqsEvent = {
	Records?: SqsEventRecord[];
};

type SnsEnvelope<TMessage> = {
	Message?: string | TMessage;
};

export function unwrapSnsMessagesFromSqsEvent<TMessage>(
	event: SqsEvent
): TMessage[] {
	const results: TMessage[] = [];

	for (const record of event.Records ?? []) {
		const body = parseJson<SnsEnvelope<TMessage>>(record.body);
		if (!body) {
			continue;
		}

		const message =
			typeof body.Message === "string"
				? parseJson<TMessage>(body.Message)
				: body.Message;

		if (message) {
			results.push(message);
		}
	}

	return results;
}

export function parseJson<TValue>(value: string): TValue | null {
	try {
		return JSON.parse(value) as TValue;
	} catch {
		return null;
	}
}
