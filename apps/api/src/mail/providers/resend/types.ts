export type ResendWebhookEvent = {
	type:
		| "email.sent"
		| "email.delivered"
		| "email.bounced"
		| "email.complained"
		| "email.failed"
		| "email.opened"
		| "email.clicked"
		| "email.received";
	created_at: string;
	data: {
		email_id: string;
		from: string;
		to: string[];
		subject: string;
		message_id?: string;
		bounce?: {
			type: string;
			subType?: string;
			message?: string;
		};
		failed?: {
			reason: string;
		};
	};
};
