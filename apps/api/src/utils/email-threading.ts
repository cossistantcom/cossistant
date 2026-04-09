import { env } from "@api/env";
import {
	getActiveInboundEmailDomain,
	getInboundEmailDomain,
} from "@api/mail/config";

/**
 * Email threading utilities for maintaining conversation continuity
 * Generates proper Message-ID, In-Reply-To, and References headers
 * and helpers for inbound reply-to addresses.
 */

const INBOUND_EMAIL_DOMAIN = "inbound.plasma-pandora.com";

/**
 * Generate a unique Message-ID for an email
 * Format: <msg-{messageId}@plasma-pandora.com>
 */
export function generateMessageId(messageId: string): string {
	return `<msg-${messageId}@plasma-pandora.com>`;
}

/**
 * Generate a conversation thread ID
 * Format: <conv-{conversationId}@plasma-pandora.com>
 */
export function generateConversationThreadId(conversationId: string): string {
	return `<conv-${conversationId}@plasma-pandora.com>`;
}

/**
 * Generate the inbound reply-to email address for a conversation.
 *
 * Our inbound domain is <anything>@inbound.plasma-pandora.com.
 * We encode:
 * - environment: in dev/test we prefix "test-", in prod we add nothing
 * - the conversation id: conv-{conversationId}
 *
 * Final format:
 *   - production: conv-{conversationId}@inbound.plasma-pandora.com
 *   - non-production: test-conv-{conversationId}@inbound.plasma-pandora.com
 */
export function generateInboundReplyAddress(params: {
	conversationId: string;
}): string {
	const envPrefix = env.NODE_ENV === "production" ? "" : "test-";
	const localPart = `${envPrefix}conv-${params.conversationId}`;
	return `${localPart}@${getActiveInboundEmailDomain()}`;
}

export type ParsedInboundReplyAddress = {
	conversationId: string;
	environment: "production" | "test";
	provider: "resend" | "ses";
};

/**
 * Parse an inbound reply-to address and extract the conversation id
 * and target environment.
 *
 * Returns null if the address doesn't match our expected pattern.
 */
export function parseInboundReplyAddress(
	address: string
): ParsedInboundReplyAddress | null {
	const [localPart, domainPart] = address.split("@");

	if (!(localPart && domainPart)) {
		return null;
	}

	const normalizedDomain = domainPart.toLowerCase();
	const provider =
		normalizedDomain === getInboundEmailDomain("ses").toLowerCase()
			? "ses"
			: normalizedDomain === getInboundEmailDomain("resend").toLowerCase()
				? "resend"
				: null;

	if (!provider) {
		return null;
	}

	const hasTestPrefix = localPart.startsWith("test-");
	const withoutEnvPrefix = hasTestPrefix
		? localPart.slice("test-".length)
		: localPart;

	if (!withoutEnvPrefix.startsWith("conv-")) {
		return null;
	}

	const conversationId = withoutEnvPrefix.slice("conv-".length);

	if (!conversationId) {
		return null;
	}

	return {
		// Make sure ULID are uppercase, resend can send them lowercase
		conversationId: conversationId.toUpperCase(),
		environment: hasTestPrefix ? "test" : "production",
		provider,
	};
}

/**
 * Generate email threading headers for a conversation message
 * These headers ensure emails thread properly in Gmail, Outlook, etc.
 */
export function generateThreadingHeaders(params: {
	conversationId: string;
	messageId?: string;
}): Record<string, string> {
	const threadId = generateConversationThreadId(params.conversationId);

	const headers: Record<string, string> = {
		// In-Reply-To: Indicates this email is a reply to the conversation thread
		"In-Reply-To": threadId,
		// References: Maintains the thread chain
		References: threadId,
	};

	// If we have a specific message ID, use it as the Message-ID
	// Otherwise, let Resend generate one
	if (params.messageId) {
		headers["Message-ID"] = generateMessageId(params.messageId);
	}

	return headers;
}

/**
 * Generate an idempotency key for email sending
 * Ensures emails aren't sent twice on retry
 * Format: conv-{conversationId}-{timestamp}
 */
export function generateEmailIdempotencyKey(params: {
	conversationId: string;
	recipientEmail: string;
	timestamp?: number;
}): string {
	const ts = params.timestamp ?? Date.now();
	// Include recipient email to allow different emails per recipient in the same batch
	// Use a hash of the email to keep the key shorter
	const emailHash = params.recipientEmail
		.split("")
		.reduce((acc, char) => acc + char.charCodeAt(0), 0);
	return `conv-${params.conversationId}-${emailHash}-${ts}`;
}
