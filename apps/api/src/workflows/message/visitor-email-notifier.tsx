import type { Database } from "@api/db";
import { isEmailSuppressed } from "@api/db/queries/email-bounce";
import {
	generateEmailIdempotencyKey,
	generateInboundReplyAddress,
	generateThreadingHeaders,
} from "@api/utils/email-threading";
import { getMessagesForEmail } from "@api/utils/notification-helpers";
import {
	logEmailSent,
	logEmailSuppressed,
} from "@api/utils/notification-monitoring";
import { MAX_MESSAGES_IN_EMAIL } from "@api/workflows/constants";
import { NewMessageInConversation, sendEmail } from "@plasma/transactional";

// Needed for email templates
import React from "react";

export type VisitorRecipient = {
	kind: "visitor";
	visitorId: string;
	email: string;
};

export type SendVisitorEmailParams = {
	db: Database;
	recipient: VisitorRecipient;
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

export async function sendVisitorEmailNotification(
	params: SendVisitorEmailParams
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

	const { messages, totalCount } = await getMessagesForEmail(db, {
		conversationId,
		organizationId,
		recipientVisitorId: recipient.visitorId,
		maxMessages: MAX_MESSAGES_IN_EMAIL,
		earliestCreatedAt: workflowState.initialMessageCreatedAt,
	});

	if (messages.length === 0) {
		return;
	}

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
					isReceiverVisitor={true}
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
