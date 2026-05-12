/**
 * Escalation Notification Sender
 *
 * Sends email and push notifications to team members when the AI escalates a conversation.
 */

import type { Database } from "@api/db";
import {
	getMemberNotificationPreference,
	getNotificationData,
} from "@api/utils/notification-helpers";
import { sendMemberPushNotification } from "@api/workflows/message/member-push-notifier";
import { EscalationNotification, sendEmail } from "@cossistant/transactional";
import { MemberNotificationChannel } from "@cossistant/types";
import type { EscalationSummary } from "./analysis/escalation-summary";

type SendEscalationNotificationParams = {
	db: Database;
	conversationId: string;
	websiteId: string;
	organizationId: string;
	escalationReason: string;
	summary: EscalationSummary | null;
	aiAgentName: string;
	visitorName: string;
};

/**
 * Send escalation notifications to all conversation participants
 *
 * This sends both email and push notifications to alert team members
 * that human attention is needed on a conversation.
 */
export async function sendEscalationNotifications(
	params: SendEscalationNotificationParams
): Promise<void> {
	const {
		db,
		conversationId,
		websiteId,
		organizationId,
		escalationReason,
		summary,
		aiAgentName,
		visitorName,
	} = params;

	try {
		// Get website info and conversation participants
		const { websiteInfo, participants } = await getNotificationData(db, {
			conversationId,
			websiteId,
			organizationId,
		});

		if (!websiteInfo) {
			console.error(
				`[escalation-notification] Website ${websiteId} not found, skipping notifications`
			);
			return;
		}

		if (participants.length === 0) {
			console.log(
				`[escalation-notification] No participants to notify for conversation ${conversationId}`
			);
			return;
		}

		console.log(
			`[escalation-notification] Sending notifications to ${participants.length} participants for conversation ${conversationId}`
		);

		// Prepare notification content
		const summaryText =
			summary?.summary ??
			`The AI has escalated this conversation: ${escalationReason}`;
		const keyPoints = summary?.keyPoints ?? [];

		// Send push notifications immediately (fire and forget)
		const pushPromises = participants.map((participant) =>
			sendMemberPushNotification({
				db,
				recipient: {
					kind: "member",
					userId: participant.userId,
					memberId: participant.memberId,
					email: participant.userEmail,
				},
				conversationId,
				organizationId,
				websiteInfo: {
					name: websiteInfo.name,
					slug: websiteInfo.slug,
					logo: websiteInfo.logo,
				},
				// Use a different title and message for escalation
				messagePreview: `Human help needed: ${escalationReason.slice(0, 80)}${escalationReason.length > 80 ? "..." : ""}`,
				senderName: aiAgentName,
			})
		);

		// Send email notifications
		const emailPromises = participants.map(async (participant) => {
			if (!participant.userEmail) {
				return false;
			}

			try {
				const preference = await getMemberNotificationPreference(db, {
					memberId: participant.memberId,
					organizationId,
					channel: MemberNotificationChannel.EMAIL_ESCALATION,
				});

				if (preference !== undefined && !preference.enabled) {
					return false;
				}

				await sendEmail({
					to: participant.userEmail,
					subject: `🚨 Human help needed - ${websiteInfo.name}`,
					react: EscalationNotification({
						website: {
							name: websiteInfo.name,
							slug: websiteInfo.slug,
						},
						conversationId,
						escalationReason,
						summary: summaryText,
						keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
						visitorName,
						aiAgentName,
					}),
				});

				console.log(
					`[escalation-notification] Email sent to ${participant.userEmail} for conversation ${conversationId}`
				);
				return true;
			} catch (error) {
				console.error(
					`[escalation-notification] Failed to send email to ${participant.userEmail}:`,
					error
				);
				return false;
			}
		});

		// Wait for all notifications to complete
		const [pushResults, emailResults] = await Promise.all([
			Promise.allSettled(pushPromises),
			Promise.allSettled(emailPromises),
		]);

		const pushSent = pushResults.filter(
			(r) => r.status === "fulfilled" && r.value.sent
		).length;
		const emailsAttempted = emailResults.filter(
			(r) => r.status === "fulfilled" && r.value
		).length;

		console.log(
			`[escalation-notification] Notifications sent for conversation ${conversationId}: ${pushSent} push, ${emailsAttempted} emails attempted`
		);
	} catch (error) {
		// Don't throw - notification failures shouldn't block escalation
		console.error(
			`[escalation-notification] Failed to send notifications for conversation ${conversationId}:`,
			error
		);
	}
}
