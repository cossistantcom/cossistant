import { createHash } from "node:crypto";

type SESLifecycleNotification = {
	eventType?: string;
	mail?: {
		messageId?: string;
		timestamp?: string;
		destination?: string[];
	};
	delivery?: {
		recipients?: string[];
	};
	bounce?: {
		bounceType?: string;
		bounceSubType?: string;
		reportingMTA?: string;
		bouncedRecipients?: Array<{
			emailAddress?: string;
			diagnosticCode?: string;
		}>;
	};
	complaint?: {
		complainedRecipients?: Array<{
			emailAddress?: string;
		}>;
	};
	reject?: {
		reason?: string;
	};
	failure?: {
		errorMessage?: string;
	};
	deliveryDelay?: {
		delayType?: string;
	};
};

type LifecycleEventPayload = {
	eventType:
		| "email.delivered"
		| "email.bounced"
		| "email.complained"
		| "email.failed";
	provider: "ses";
	eventId: string;
	occurredAt: string;
	recipientEmail: string;
	messageId: string | null;
	bounce?: {
		type: string;
		subType?: string | null;
		message?: string | null;
	} | null;
	failure?: {
		reason: string;
	} | null;
};

function buildEventId(seed: string) {
	return createHash("sha1").update(seed).digest("hex");
}

function buildBaseEvent(params: {
	eventType: LifecycleEventPayload["eventType"];
	recipientEmail: string;
	occurredAt: string;
	messageId: string | null;
	seed: string;
}) {
	return {
		eventType: params.eventType,
		provider: "ses" as const,
		eventId: buildEventId(params.seed),
		occurredAt: params.occurredAt,
		recipientEmail: params.recipientEmail,
		messageId: params.messageId,
	};
}

export function normalizeSesLifecycleEvents(
	message: SESLifecycleNotification
): LifecycleEventPayload[] {
	const eventType = message.eventType?.trim();
	const occurredAt = message.mail?.timestamp ?? new Date().toISOString();
	const messageId = message.mail?.messageId ?? null;

	switch (eventType) {
		case "Delivery":
			return (message.delivery?.recipients ?? message.mail?.destination ?? [])
				.filter(Boolean)
				.map((recipientEmail) => ({
					...buildBaseEvent({
						eventType: "email.delivered",
						recipientEmail,
						occurredAt,
						messageId,
						seed: `${messageId}:${recipientEmail}:delivery`,
					}),
				}));

		case "Bounce":
			return (message.bounce?.bouncedRecipients ?? [])
				.map((recipient) => {
					if (!recipient.emailAddress) {
						return null;
					}

					return {
						...buildBaseEvent({
							eventType: "email.bounced",
							recipientEmail: recipient.emailAddress,
							occurredAt,
							messageId,
							seed: `${messageId}:${recipient.emailAddress}:bounce`,
						}),
						bounce: {
							type: message.bounce?.bounceType ?? "Unknown",
							subType: message.bounce?.bounceSubType ?? null,
							message:
								recipient.diagnosticCode ??
								message.bounce?.reportingMTA ??
								null,
						},
					};
				})
				.filter((value): value is LifecycleEventPayload => Boolean(value));

		case "Complaint":
			return (message.complaint?.complainedRecipients ?? [])
				.map((recipient) => {
					if (!recipient.emailAddress) {
						return null;
					}

					return {
						...buildBaseEvent({
							eventType: "email.complained",
							recipientEmail: recipient.emailAddress,
							occurredAt,
							messageId,
							seed: `${messageId}:${recipient.emailAddress}:complaint`,
						}),
					};
				})
				.filter((value): value is LifecycleEventPayload => Boolean(value));

		case "Reject":
		case "Rendering Failure":
		case "DeliveryDelay":
			return (message.mail?.destination ?? [])
				.filter(Boolean)
				.map((recipientEmail) => ({
					...buildBaseEvent({
						eventType: "email.failed",
						recipientEmail,
						occurredAt,
						messageId,
						seed: `${messageId}:${recipientEmail}:${eventType}`,
					}),
					failure: {
						reason: getFailureReason(message, eventType),
					},
				}));

		default:
			return [];
	}
}

function getFailureReason(
	message: SESLifecycleNotification,
	eventType: string
): string {
	if (eventType === "Reject") {
		return message.reject?.reason ?? "Rejected by SES";
	}

	if (eventType === "Rendering Failure") {
		return message.failure?.errorMessage ?? "Rendering failure";
	}

	if (eventType === "DeliveryDelay") {
		return message.deliveryDelay?.delayType ?? "Delivery delayed";
	}

	return eventType;
}
