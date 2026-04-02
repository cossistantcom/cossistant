import type { SeenActorType } from "@plasma/core";
import type { ConversationSeen } from "@plasma/types/schemas";

export type TimelineReadReceiptReaderMeta = {
	id: string;
	actorType: SeenActorType | null;
	lastSeenAt: string | null;
};

export type TimelineResolvedReadReceipt<TParticipant> =
	TimelineReadReceiptReaderMeta & {
		participant: TParticipant;
	};

export type ResolveTimelineReadReceiptParticipant<TParticipant> = (
	reader: TimelineReadReceiptReaderMeta
) => TParticipant | null;

export type ResolveTimelineReadReceiptReadersOptions<TParticipant> = {
	itemId: string;
	lastReadItemIds?: Map<string, string>;
	seenData?: ConversationSeen[];
	currentViewerId?: string | null;
	senderIds?: readonly string[];
	resolveParticipant: ResolveTimelineReadReceiptParticipant<TParticipant>;
};

type SeenMetadata = {
	actorType: SeenActorType | null;
	lastSeenAt: string | null;
};

function getSeenIdentity(
	seen: ConversationSeen
): { actorId: string; actorType: SeenActorType } | null {
	if (seen.userId) {
		return { actorId: seen.userId, actorType: "user" };
	}

	if (seen.aiAgentId) {
		return { actorId: seen.aiAgentId, actorType: "ai_agent" };
	}

	if (seen.visitorId) {
		return { actorId: seen.visitorId, actorType: "visitor" };
	}

	return null;
}

function buildSeenMetadataByReaderId(
	seenData: ConversationSeen[]
): Map<string, SeenMetadata> {
	const metadataByReaderId = new Map<string, SeenMetadata>();

	for (const seen of seenData) {
		const identity = getSeenIdentity(seen);
		if (!identity) {
			continue;
		}

		const nextTimestamp = Date.parse(seen.lastSeenAt);
		const existing = metadataByReaderId.get(identity.actorId);
		const existingTimestamp = existing?.lastSeenAt
			? Date.parse(existing.lastSeenAt)
			: Number.NEGATIVE_INFINITY;

		if (
			existing &&
			!Number.isNaN(existingTimestamp) &&
			!Number.isNaN(nextTimestamp) &&
			existingTimestamp > nextTimestamp
		) {
			continue;
		}

		metadataByReaderId.set(identity.actorId, {
			actorType: identity.actorType,
			lastSeenAt: seen.lastSeenAt ?? null,
		});
	}

	return metadataByReaderId;
}

export function getTimelineLastReaderIds(
	itemId: string,
	lastReadItemIds?: Map<string, string>
): string[] {
	if (!lastReadItemIds) {
		return [];
	}

	const lastReaderIds: string[] = [];

	lastReadItemIds.forEach((lastItemId, readerId) => {
		if (lastItemId === itemId) {
			lastReaderIds.push(readerId);
		}
	});

	return lastReaderIds;
}

export function resolveTimelineReadReceiptReaders<TParticipant>({
	itemId,
	lastReadItemIds,
	seenData = [],
	currentViewerId,
	senderIds = [],
	resolveParticipant,
}: ResolveTimelineReadReceiptReadersOptions<TParticipant>): {
	lastReaderIds: string[];
	readers: TimelineResolvedReadReceipt<TParticipant>[];
} {
	const lastReaderIds = getTimelineLastReaderIds(itemId, lastReadItemIds);

	if (lastReaderIds.length === 0) {
		return { lastReaderIds, readers: [] };
	}

	const excludedReaderIds = new Set<string>();
	if (currentViewerId) {
		excludedReaderIds.add(currentViewerId);
	}

	for (const senderId of senderIds) {
		if (senderId) {
			excludedReaderIds.add(senderId);
		}
	}

	const seenMetadataByReaderId = buildSeenMetadataByReaderId(seenData);
	const uniqueReaderIds = new Set<string>();
	const readers: TimelineResolvedReadReceipt<TParticipant>[] = [];

	for (const readerId of lastReaderIds) {
		if (
			!readerId ||
			excludedReaderIds.has(readerId) ||
			uniqueReaderIds.has(readerId)
		) {
			continue;
		}

		uniqueReaderIds.add(readerId);

		const metadata = seenMetadataByReaderId.get(readerId) ?? {
			actorType: null,
			lastSeenAt: null,
		};

		const participant = resolveParticipant({
			id: readerId,
			actorType: metadata.actorType,
			lastSeenAt: metadata.lastSeenAt,
		});

		if (!participant) {
			continue;
		}

		readers.push({
			id: readerId,
			actorType: metadata.actorType,
			lastSeenAt: metadata.lastSeenAt,
			participant,
		});
	}

	return { lastReaderIds, readers };
}
