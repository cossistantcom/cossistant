import type { CreateBatchOptions, CreateEmailOptions } from "resend";
import { ANTHONY_EMAIL, VARIANT_TO_FROM_MAP } from "./resend-utils/constants";
import { resend } from "./resend-utils/index";
import type {
	ResendBulkEmailOptions,
	ResendEmailOptions,
} from "./resend-utils/types";

/**
 * Transform email options to Resend format
 */
const prepareEmailOptions = (opts: ResendEmailOptions): CreateEmailOptions => {
	const {
		to,
		from,
		variant = "notifications",
		bcc,
		cc,
		replyTo,
		subject,
		text,
		react,
		scheduledAt,
		headers = {},
		tags,
		attachments,
	} = opts;

	// Build email data object conditionally based on what's provided
	const baseEmail = {
		to: Array.isArray(to) ? to : [to],
		from: from || VARIANT_TO_FROM_MAP[variant],
		subject,
	};

	// Add optional fields
	const optionalFields: Partial<CreateEmailOptions> = {};

	if (bcc) {
		optionalFields.bcc = bcc;
	}
	if (cc) {
		optionalFields.cc = cc;
	}
	if (text) {
		optionalFields.text = text;
	}
	if (react) {
		optionalFields.react = react;
	}
	if (scheduledAt) {
		optionalFields.scheduledAt = scheduledAt;
	}
	if (tags) {
		optionalFields.tags = tags;
	}
	if (attachments) {
		optionalFields.attachments = attachments;
	}

	// Handle replyTo - if explicitly set to "noreply", omit it, otherwise use provided or default
	if (replyTo !== "noreply") {
		optionalFields.replyTo = replyTo || ANTHONY_EMAIL;
	}

	// Add List-Unsubscribe header for marketing emails
	let finalHeaders = headers;

	if (variant === "marketing") {
		finalHeaders = {
			...headers,
			"List-Unsubscribe": "<https://plasma-pandora.com/email/unsubscribe>",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		};
	}

	if (Object.keys(finalHeaders).length > 0) {
		optionalFields.headers = finalHeaders;
	}

	return { ...baseEmail, ...optionalFields } as CreateEmailOptions;
};

/**
 * Send a single email using Resend
 * @example
 * await sendEmail({
 *   to: "user@example.com",
 *   subject: "Welcome!",
 *   react: <WelcomeEmail />,
 *   variant: "notifications",
 * }, { idempotencyKey: "unique-key" });
 */
export const sendEmail = async (
	opts: ResendEmailOptions,
	options?: { idempotencyKey?: string }
) => {
	if (!resend) {
		console.warn(
			"RESEND_API_KEY is not set in the environment. Skipping email send."
		);
		return { data: null, error: new Error("Resend client not initialized") };
	}

	try {
		const emailOptions = prepareEmailOptions(opts);
		const { idempotencyKey } = options || {};

		return await resend.emails.send(
			emailOptions,
			idempotencyKey ? { idempotencyKey } : undefined
		);
	} catch (error) {
		console.error("Failed to send email:", error);
		throw error;
	}
};

/**
 * Send multiple emails in batch using Resend
 * @example
 * await sendBatchEmail([
 *   { to: "user1@example.com", subject: "Welcome!", react: <Email /> },
 *   { to: "user2@example.com", subject: "Welcome!", react: <Email /> },
 * ]);
 */
export const sendBatchEmail = async (
	opts: ResendBulkEmailOptions,
	options?: { idempotencyKey?: string }
) => {
	if (!resend) {
		console.warn(
			"RESEND_API_KEY is not set in the environment. Skipping batch email send."
		);
		return { data: null, error: new Error("Resend client not initialized") };
	}

	if (opts.length === 0) {
		return { data: null, error: null };
	}

	try {
		const payload: CreateBatchOptions = opts.map(prepareEmailOptions);
		const { idempotencyKey } = options || {};

		return await resend.batch.send(
			payload,
			idempotencyKey ? { idempotencyKey } : undefined
		);
	} catch (error) {
		console.error("Failed to send batch emails:", error);
		throw error;
	}
};

// Legacy exports for backward compatibility
export const sendEmailViaResend = sendEmail;
export const sendBatchEmailViaResend = sendBatchEmail;
