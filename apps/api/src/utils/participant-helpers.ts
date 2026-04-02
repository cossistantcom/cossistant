import type { Database } from "@api/db";
import { conversationParticipant, member } from "@api/db/schema";
import { generateShortPrimaryId } from "@api/utils/db/ids";
import { ConversationParticipationStatus } from "@plasma/types";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * Get admin and owner user IDs for an organization
 */
export async function getAdminAndOwnerIds(
	db: Database,
	organizationId: string
): Promise<string[]> {
	const members = await db
		.select({
			userId: member.userId,
		})
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				inArray(member.role, ["admin", "owner"])
			)
		);

	return members.map((m) => m.userId);
}

/**
 * Get default participants for a website based on defaultParticipantIds setting
 * - null: returns empty array (feature disabled)
 * - empty array: returns admin/owner IDs (auto mode)
 * - array with IDs: returns those IDs (specific users mode)
 */
export async function getDefaultParticipants(
	db: Database,
	websiteRecord: {
		defaultParticipantIds: string[] | null;
		organizationId: string;
	}
): Promise<string[]> {
	// Feature disabled
	if (websiteRecord.defaultParticipantIds === null) {
		return [];
	}

	// Auto mode - get admin/owner when empty array
	if (websiteRecord.defaultParticipantIds.length === 0) {
		return getAdminAndOwnerIds(db, websiteRecord.organizationId);
	}

	// Specific users mode
	return websiteRecord.defaultParticipantIds;
}

/**
 * Check if a user is already a participant in a conversation
 */
export async function isUserParticipant(
	db: Database,
	params: {
		conversationId: string;
		userId: string;
	}
): Promise<boolean> {
	const [participant] = await db
		.select({
			id: conversationParticipant.id,
		})
		.from(conversationParticipant)
		.where(
			and(
				eq(conversationParticipant.conversationId, params.conversationId),
				eq(conversationParticipant.userId, params.userId),
				eq(
					conversationParticipant.status,
					ConversationParticipationStatus.ACTIVE
				),
				isNull(conversationParticipant.leftAt)
			)
		)
		.limit(1);

	return !!participant;
}

/**
 * Add a user as a conversation participant
 */
export async function addConversationParticipant(
	db: Database,
	params: {
		conversationId: string;
		userId: string;
		organizationId: string;
		requestedByUserId?: string;
		requestedByAiAgentId?: string;
		reason?: string;
	}
): Promise<string> {
	const participantId = generateShortPrimaryId();
	const now = new Date().toISOString();

	// Check if participant already exists (including inactive ones)
	const [existingParticipant] = await db
		.select({
			id: conversationParticipant.id,
			status: conversationParticipant.status,
			leftAt: conversationParticipant.leftAt,
		})
		.from(conversationParticipant)
		.where(
			and(
				eq(conversationParticipant.conversationId, params.conversationId),
				eq(conversationParticipant.userId, params.userId)
			)
		)
		.limit(1);

	if (existingParticipant) {
		// Reactivate if they left
		if (
			existingParticipant.leftAt ||
			existingParticipant.status !== ConversationParticipationStatus.ACTIVE
		) {
			await db
				.update(conversationParticipant)
				.set({
					status: ConversationParticipationStatus.ACTIVE,
					leftAt: null,
					joinedAt: now,
					requestedByUserId: params.requestedByUserId,
					requestedByAiAgentId: params.requestedByAiAgentId,
					reason: params.reason,
				})
				.where(eq(conversationParticipant.id, existingParticipant.id));

			return existingParticipant.id;
		}

		// Already active participant
		return existingParticipant.id;
	}

	// Create new participant
	await db.insert(conversationParticipant).values({
		id: participantId,
		conversationId: params.conversationId,
		userId: params.userId,
		organizationId: params.organizationId,
		status: ConversationParticipationStatus.ACTIVE,
		requestedByUserId: params.requestedByUserId,
		requestedByAiAgentId: params.requestedByAiAgentId,
		reason: params.reason,
		joinedAt: now,
		createdAt: now,
	});

	return participantId;
}

/**
 * Add multiple participants to a conversation
 */
export async function addConversationParticipants(
	db: Database,
	params: {
		conversationId: string;
		userIds: string[];
		organizationId: string;
		requestedByUserId?: string;
		requestedByAiAgentId?: string;
		reason?: string;
	}
): Promise<string[]> {
	const participantIds: string[] = [];

	for (const userId of params.userIds) {
		const participantId = await addConversationParticipant(db, {
			conversationId: params.conversationId,
			userId,
			organizationId: params.organizationId,
			requestedByUserId: params.requestedByUserId,
			requestedByAiAgentId: params.requestedByAiAgentId,
			reason: params.reason,
		});
		participantIds.push(participantId);
	}

	return participantIds;
}
