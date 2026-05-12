import type { Database } from "@api/db";
import { getConversationById } from "@api/db/queries/conversation";
import { getMemberNotificationSettings } from "@api/db/queries/member-notification-settings";
import {
	contact,
	conversationParticipant,
	conversationSeen,
	conversationTimelineItem,
	member,
	user,
	visitor,
	website,
} from "@api/db/schema";
import {
	getVisitorNameWithFallback,
	resolveTimelineItemText,
} from "@cossistant/core";
import {
	ConversationParticipationStatus,
	MemberNotificationChannel,
} from "@cossistant/types";
import { and, desc, eq, gt, gte, inArray, isNull, ne, or } from "drizzle-orm";

/**
 * Get all active conversation participants except the sender
 */
export async function getConversationParticipantsForNotification(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		excludeUserId?: string;
	}
) {
	const participants = await db
		.select({
			userId: conversationParticipant.userId,
			memberId: member.id,
			userEmail: user.email,
			userName: user.name,
			userImage: user.image,
		})
		.from(conversationParticipant)
		.innerJoin(user, eq(conversationParticipant.userId, user.id))
		.innerJoin(
			member,
			and(
				eq(member.userId, user.id),
				eq(member.organizationId, params.organizationId)
			)
		)
		.where(
			and(
				eq(conversationParticipant.conversationId, params.conversationId),
				eq(conversationParticipant.organizationId, params.organizationId),
				eq(
					conversationParticipant.status,
					ConversationParticipationStatus.ACTIVE
				),
				isNull(conversationParticipant.leftAt),
				params.excludeUserId
					? ne(conversationParticipant.userId, params.excludeUserId)
					: undefined
			)
		);

	return participants;
}

/**
 * Get visitor email for notification
 */
export async function getVisitorEmailForNotification(
	db: Database,
	params: {
		visitorId: string;
		websiteId: string;
	}
) {
	const [result] = await db
		.select({
			visitorId: visitor.id,
			contactId: contact.id,
			contactEmail: contact.email,
			contactName: contact.name,
			contactImage: contact.image,
		})
		.from(visitor)
		.leftJoin(contact, eq(visitor.contactId, contact.id))
		.where(
			and(
				eq(visitor.id, params.visitorId),
				eq(visitor.websiteId, params.websiteId),
				isNull(visitor.deletedAt),
				isNull(visitor.blockedAt)
			)
		)
		.limit(1);

	return result;
}

/**
 * Get member's notification preferences for email notifications
 */
export async function getMemberNotificationPreference(
	db: Database,
	params: {
		memberId: string;
		organizationId: string;
		channel?: MemberNotificationChannel;
	}
) {
	const settings = await getMemberNotificationSettings(db, {
		memberId: params.memberId,
		organizationId: params.organizationId,
	});

	const channel = params.channel ?? MemberNotificationChannel.EMAIL_NEW_MESSAGE;
	const notificationSetting = settings.settings.find(
		(s) => s.channel === channel
	);

	return notificationSetting;
}

/**
 * Get unseen messages for a recipient in a conversation
 * Returns all messages that were created after the recipient's lastSeenAt timestamp
 * and excludes messages authored by the recipient themselves
 * Can optionally filter to only include messages after a specific timestamp
 */
export async function getUnseenMessagesForRecipient(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		recipientUserId?: string;
		recipientVisitorId?: string;
		earliestCreatedAt?: string | Date;
		lastSeenAt?: string | Date | null;
	}
) {
	const hasRecipientUserId = typeof params.recipientUserId === "string";
	const hasRecipientVisitorId = typeof params.recipientVisitorId === "string";

	if (hasRecipientUserId || hasRecipientVisitorId) {
		// ok
	} else {
		throw new Error(
			"Either recipientUserId or recipientVisitorId must be provided"
		);
	}

	// Determine the lastSeenAt value, either from the override or by querying the DB
	let lastSeenAt: string | null = null;

	if (params.lastSeenAt !== undefined) {
		if (params.lastSeenAt instanceof Date) {
			lastSeenAt = params.lastSeenAt.toISOString();
		} else {
			lastSeenAt = params.lastSeenAt ?? null;
		}
	} else {
		const seenWhere = params.recipientUserId
			? and(
					eq(conversationSeen.conversationId, params.conversationId),
					eq(conversationSeen.userId, params.recipientUserId)
				)
			: and(
					eq(conversationSeen.conversationId, params.conversationId),
					eq(conversationSeen.visitorId, params.recipientVisitorId as string)
				);

		const [seenRecord] = await db
			.select({
				lastSeenAt: conversationSeen.lastSeenAt,
			})
			.from(conversationSeen)
			.where(seenWhere)
			.limit(1);

		lastSeenAt = seenRecord?.lastSeenAt ?? null;
	}

	// Build base conditions for messages - be permissive here
	const baseConditions = [
		eq(conversationTimelineItem.conversationId, params.conversationId),
		eq(conversationTimelineItem.organizationId, params.organizationId),
		eq(conversationTimelineItem.type, "message"),
		eq(conversationTimelineItem.visibility, "public"),
		isNull(conversationTimelineItem.deletedAt),
	];

	// Handle date filtering
	// When both lastSeenAt and earliestCreatedAt exist, we need to be careful:
	// - lastSeenAt: messages created AFTER this time (user hasn't seen them)
	// - earliestCreatedAt: messages created AT OR AFTER this time (include the initial message)

	if (lastSeenAt && params.earliestCreatedAt) {
		// Convert earliestCreatedAt to string if needed
		const earliestDate =
			params.earliestCreatedAt instanceof Date
				? params.earliestCreatedAt.toISOString()
				: params.earliestCreatedAt;

		// If user has seen messages AFTER the initial message was created,
		// only show messages created after lastSeenAt
		if (lastSeenAt >= earliestDate) {
			baseConditions.push(gt(conversationTimelineItem.createdAt, lastSeenAt));
		} else {
			// User hasn't seen the initial message yet, show from earliestCreatedAt onwards
			baseConditions.push(
				gte(conversationTimelineItem.createdAt, earliestDate)
			);
		}
	} else if (lastSeenAt) {
		// Only lastSeenAt exists - show messages created after it
		baseConditions.push(gt(conversationTimelineItem.createdAt, lastSeenAt));
	} else if (params.earliestCreatedAt) {
		// Only earliestCreatedAt exists - show messages from that point onwards
		const earliestDate =
			params.earliestCreatedAt instanceof Date
				? params.earliestCreatedAt.toISOString()
				: params.earliestCreatedAt;
		baseConditions.push(gte(conversationTimelineItem.createdAt, earliestDate));
	}

	const messages = await db
		.select({
			id: conversationTimelineItem.id,
			text: conversationTimelineItem.text,
			parts: conversationTimelineItem.parts,
			createdAt: conversationTimelineItem.createdAt,
			userId: conversationTimelineItem.userId,
			visitorId: conversationTimelineItem.visitorId,
			aiAgentId: conversationTimelineItem.aiAgentId,
		})
		.from(conversationTimelineItem)
		.where(and(...baseConditions))
		.orderBy(desc(conversationTimelineItem.createdAt));

	// Filter out messages authored by the recipient in code
	const filteredMessages = messages.filter((message) => {
		if (params.recipientUserId) {
			// Exclude messages where the userId matches the recipient's userId
			return message.userId !== params.recipientUserId;
		}
		if (params.recipientVisitorId) {
			// Exclude messages where the visitorId matches the recipient's visitorId
			return message.visitorId !== params.recipientVisitorId;
		}
		return true;
	});

	return filteredMessages;
}

/**
 * Get messages for email with sender information
 * Fetches up to maxMessages with sender details (user or visitor name/image)
 * Can optionally filter to only include messages after a specific timestamp
 */
export async function getMessagesForEmail(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		recipientUserId?: string;
		recipientVisitorId?: string;
		maxMessages?: number;
		earliestCreatedAt?: string | Date;
		lastSeenAt?: string | Date | null;
	}
) {
	const unseenMessages = await getUnseenMessagesForRecipient(db, {
		conversationId: params.conversationId,
		organizationId: params.organizationId,
		recipientUserId: params.recipientUserId,
		recipientVisitorId: params.recipientVisitorId,
		earliestCreatedAt: params.earliestCreatedAt,
		lastSeenAt: params.lastSeenAt,
	});

	if (unseenMessages.length === 0) {
		return { messages: [], totalCount: 0 };
	}

	const maxMessages = params.maxMessages ?? 3;
	const limitedMessages = unseenMessages.slice(0, maxMessages);

	// Enrich messages with sender information
	const enrichedMessages = await Promise.all(
		limitedMessages.map(async (message) => {
			let senderName = "Unknown";
			let senderImage: string | null = null;

			if (message.userId) {
				const [userInfo] = await db
					.select({
						name: user.name,
						image: user.image,
					})
					.from(user)
					.where(eq(user.id, message.userId))
					.limit(1);

				if (userInfo) {
					senderName = userInfo.name;
					senderImage = userInfo.image;
				}
			} else if (message.visitorId) {
				const [visitorInfo] = await db
					.select({
						contactName: contact.name,
						contactEmail: contact.email,
						contactImage: contact.image,
					})
					.from(visitor)
					.leftJoin(contact, eq(visitor.contactId, contact.id))
					.where(eq(visitor.id, message.visitorId))
					.limit(1);

				senderName = getVisitorNameWithFallback({
					id: message.visitorId,
					contact: visitorInfo
						? {
								name: visitorInfo.contactName,
								email: visitorInfo.contactEmail,
							}
						: null,
				});
				senderImage = visitorInfo?.contactImage ?? null;
			}

			return {
				text:
					resolveTimelineItemText(
						{
							text: message.text,
							parts: Array.isArray(message.parts) ? message.parts : [],
						},
						params.recipientUserId ? "team" : "visitor"
					) ?? "",
				createdAt: new Date(message.createdAt),
				sender: {
					id:
						message.userId ||
						message.visitorId ||
						message.aiAgentId ||
						"unknown",
					name: senderName,
					image: senderImage,
				},
			};
		})
	);

	return {
		messages: enrichedMessages.reverse(), // Reverse to show oldest first, newest last
		totalCount: unseenMessages.length,
	};
}

/**
 * Get website information for email notification
 */
export async function getWebsiteForNotification(
	db: Database,
	params: {
		websiteId: string;
	}
) {
	const [websiteInfo] = await db
		.select({
			id: website.id,
			name: website.name,
			slug: website.slug,
			logo: website.logoUrl,
		})
		.from(website)
		.where(eq(website.id, params.websiteId))
		.limit(1);

	return websiteInfo;
}

/**
 * Check if visitor has email notifications enabled
 * Checks contact.notificationSettings JSONB field
 * Returns true if enabled or if no preference is set (default to enabled)
 */
export async function isVisitorEmailNotificationEnabled(
	db: Database,
	params: {
		visitorId: string;
		websiteId: string;
	}
): Promise<boolean> {
	const [result] = await db
		.select({
			contactId: visitor.contactId,
		})
		.from(visitor)
		.where(
			and(
				eq(visitor.id, params.visitorId),
				eq(visitor.websiteId, params.websiteId)
			)
		)
		.limit(1);

	if (!result?.contactId) {
		// No contact associated, default to enabled
		return true;
	}

	const [contactInfo] = await db
		.select({
			notificationSettings: contact.notificationSettings,
		})
		.from(contact)
		.where(eq(contact.id, result.contactId))
		.limit(1);

	// If no notification settings, default to enabled
	if (!contactInfo?.notificationSettings) {
		return true;
	}

	// Check if emailNotifications is explicitly disabled
	const settings = contactInfo.notificationSettings as {
		emailNotifications?: boolean;
	};

	// Default to true if not explicitly set to false
	return settings.emailNotifications !== false;
}

/**
 * Get the latest message for push notification
 * Returns the most recent message text and sender name
 */
export async function getLatestMessageForPush(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
	}
): Promise<{ text: string; senderName: string } | null> {
	// Get the latest public message in the conversation
	const [latestMessage] = await db
		.select({
			text: conversationTimelineItem.text,
			parts: conversationTimelineItem.parts,
			userId: conversationTimelineItem.userId,
			visitorId: conversationTimelineItem.visitorId,
		})
		.from(conversationTimelineItem)
		.where(
			and(
				eq(conversationTimelineItem.conversationId, params.conversationId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, "message"),
				eq(conversationTimelineItem.visibility, "public"),
				isNull(conversationTimelineItem.deletedAt)
			)
		)
		.orderBy(desc(conversationTimelineItem.createdAt))
		.limit(1);

	const latestMessageText =
		latestMessage &&
		resolveTimelineItemText(
			{
				text: latestMessage.text,
				parts: Array.isArray(latestMessage.parts) ? latestMessage.parts : [],
			},
			"team"
		);

	if (!latestMessageText) {
		return null;
	}

	// Get sender name
	let senderName = "Someone";

	if (latestMessage.userId) {
		const [userInfo] = await db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, latestMessage.userId))
			.limit(1);

		if (userInfo?.name) {
			senderName = userInfo.name;
		}
	} else if (latestMessage.visitorId) {
		const [visitorInfo] = await db
			.select({
				contactName: contact.name,
				contactEmail: contact.email,
			})
			.from(visitor)
			.leftJoin(contact, eq(visitor.contactId, contact.id))
			.where(eq(visitor.id, latestMessage.visitorId))
			.limit(1);

		senderName = getVisitorNameWithFallback({
			id: latestMessage.visitorId,
			contact: visitorInfo
				? {
						name: visitorInfo.contactName,
						email: visitorInfo.contactEmail,
					}
				: null,
		});
	}

	return {
		text: latestMessageText,
		senderName,
	};
}

/**
 * Fetch all notification data in one step
 * Consolidates conversation, website, and participant data fetching
 */
export async function getNotificationData(
	db: Database,
	params: {
		conversationId: string;
		websiteId: string;
		organizationId: string;
		excludeUserId?: string;
	}
) {
	const [conversation, websiteInfo, participants] = await Promise.all([
		getConversationById(db, { conversationId: params.conversationId }),
		getWebsiteForNotification(db, { websiteId: params.websiteId }),
		getConversationParticipantsForNotification(db, {
			conversationId: params.conversationId,
			organizationId: params.organizationId,
			excludeUserId: params.excludeUserId,
		}),
	]);

	return {
		conversation,
		websiteInfo,
		participants,
	};
}
