export type EmailTransportProvider = "resend" | "ses";

export type EmailVariant = "notifications" | "marketing";

export type EmailAttachment = {
	filename?: string;
	content?: Buffer | string;
};

export type MailAddressList = string | string[];

export type MailTag = {
	name: string;
	value: string;
};

export type MailSendOptions = {
	to: MailAddressList;
	from?: string;
	subject: string;
	variant?: EmailVariant;
	react?: React.ReactElement;
	text?: string;
	bcc?: MailAddressList;
	cc?: MailAddressList;
	replyTo?: MailAddressList | "noreply";
	headers?: Record<string, string>;
	scheduledAt?: string;
	tags?: MailTag[];
	attachments?: EmailAttachment[];
};

export type MailBulkSendOptions = MailSendOptions[];

export type PreparedMail = {
	to: string[];
	from: string;
	subject: string;
	bcc?: string[];
	cc?: string[];
	replyTo?: string[];
	headers?: Record<string, string>;
	html?: string;
	text?: string;
	scheduledAt?: string;
	tags?: MailTag[];
	attachments?: EmailAttachment[];
};

export type MailProviderSendOptions = {
	idempotencyKey?: string;
};

export type MailProviderSendResult = {
	data: unknown;
	error: Error | null;
};

export type MailTransport = {
	send(
		mail: PreparedMail,
		options?: MailProviderSendOptions
	): Promise<MailProviderSendResult>;
	sendBatch(
		mail: PreparedMail[],
		options?: MailProviderSendOptions
	): Promise<MailProviderSendResult>;
};
