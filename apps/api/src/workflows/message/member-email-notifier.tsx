import type { Database } from "@api/db";
import { isEmailSuppressed } from "@api/db/queries/email-bounce";
import {
	generateEmailIdempotencyKey,
	generateInboundReplyAddress,
	generateThreadingHeaders,
} from "@api/utils/email-threading";
import {
	getMemberNotificationPreference,
	getMessagesForEmail,
} from "@api/utils/notification-helpers";
import {
	logEmailSent,
	logEmailSuppressed,
} from "@api/utils/notification-monitoring";
import { MAX_MESSAGES_IN_EMAIL } from "@api/workflows/constants";
import { NewMessageInConversation, sendEmail } from "@plasma/transactional";

// Needed for email templates
import React from "react";

export type MemberRecipient = {
	kind: "member";
	userId: string;
	memberId: string;
	email: string;
};

export type SendMemberEmailParams = {
	db: Database;
	recipient: MemberRecipient;
	conversationId: string;
	organizationId: string;
	websiteInfo: {
		name: string;
		slug: string;
		logo: string | null;
	};
	workflowState: {
		initialMessageCreatedAt: string;
	};
};

/**
 * Shared function to send email notifications to members
 * Handles preference checking, message fetching, suppression checking, and email sending
 */
export async function sendMemberEmailNotification(
	params: SendMemberEmailParams
): Promise<void> {
	const {
		db,
		recipient,
		conversationId,
		organizationId,
		websiteInfo,
		workflowState,
	} = params;

	if (!recipient.email) {
		return;
	}

	// Check member notification preferences
	const preference = await getMemberNotificationPreference(db, {
		memberId: recipient.memberId,
		organizationId,
	});

	// If preference is undefined, it means the member has not set up their notification preferences
	// and we should send the email by default
	if (preference !== undefined && !preference.enabled) {
		return;
	}

	// Fetch unseen messages for this recipient
	// Note: getMessagesForEmail will fetch the current lastSeenAt from the database
	const { messages, totalCount } = await getMessagesForEmail(db, {
		conversationId,
		organizationId,
		recipientUserId: recipient.userId,
		maxMessages: MAX_MESSAGES_IN_EMAIL,
		earliestCreatedAt: workflowState.initialMessageCreatedAt,
	});

	if (messages.length === 0) {
		return;
	}

	// Check suppression
	const isSuppressed = await isEmailSuppressed(db, {
		email: recipient.email,
		organizationId,
	});

	if (isSuppressed) {
		logEmailSuppressed({
			email: recipient.email,
			conversationId,
			organizationId,
			reason: "bounced_or_complained",
		});
		return;
	}

	// Send email notification
	const threadingHeaders = generateThreadingHeaders({
		conversationId,
	});

	const idempotencyKey = generateEmailIdempotencyKey({
		conversationId,
		recipientEmail: recipient.email,
		timestamp: new Date(workflowState.initialMessageCreatedAt).getTime(),
	});

	await sendEmail(
		{
			to: recipient.email,
			replyTo: generateInboundReplyAddress({
				conversationId,
			}),
			subject:
				totalCount > 1
					? `${totalCount} new messages from ${websiteInfo.name}`
					: `New message from ${websiteInfo.name}`,
			react: (
				<NewMessageInConversation
					conversationId={conversationId}
					email={recipient.email}
					isReceiverVisitor={false}
					messages={messages}
					totalCount={totalCount}
					website={{
						name: websiteInfo.name,
						slug: websiteInfo.slug,
						logo: websiteInfo.logo,
					}}
				/>
			),
			variant: "notifications",
			headers: threadingHeaders,
		},
		{ idempotencyKey }
	);

	logEmailSent({
		email: recipient.email,
		conversationId,
		organizationId,
	});
}
