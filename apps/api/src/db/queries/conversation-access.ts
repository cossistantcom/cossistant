import type { Database } from "@api/db";
import { contact, visitor } from "@api/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export type ActiveVisitorRecord = typeof visitor.$inferSelect;

type ConversationAccessVisitor = {
	id: string;
	contactId: string | null;
	activeContactId: string | null;
};

export type VisitorConversationScope = {
	visitorId: string;
	contactId: string | null;
	visitorIds: string[];
	isContactScoped: boolean;
};

export async function getActiveVisitorForWebsite(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		visitorId: string;
	}
): Promise<ActiveVisitorRecord | null> {
	const [record] = await db
		.select()
		.from(visitor)
		.where(
			and(
				eq(visitor.id, params.visitorId),
				eq(visitor.organizationId, params.organizationId),
				eq(visitor.websiteId, params.websiteId),
				isNull(visitor.deletedAt)
			)
		)
		.limit(1);

	return record ?? null;
}

async function getConversationAccessVisitor(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		visitorId: string;
	}
): Promise<ConversationAccessVisitor | null> {
	const [record] = await db
		.select({
			id: visitor.id,
			contactId: visitor.contactId,
			activeContactId: contact.id,
		})
		.from(visitor)
		.leftJoin(
			contact,
			and(
				eq(visitor.contactId, contact.id),
				eq(contact.organizationId, params.organizationId),
				eq(contact.websiteId, params.websiteId),
				isNull(contact.deletedAt)
			)
		)
		.where(
			and(
				eq(visitor.id, params.visitorId),
				eq(visitor.organizationId, params.organizationId),
				eq(visitor.websiteId, params.websiteId),
				isNull(visitor.deletedAt)
			)
		)
		.limit(1);

	if (!record) {
		return null;
	}

	return {
		id: record.id,
		contactId: record.activeContactId ? record.contactId : null,
		activeContactId: record.activeContactId,
	};
}

export async function resolveVisitorConversationScope(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		visitorId: string;
	}
): Promise<VisitorConversationScope | null> {
	const viewer = await getConversationAccessVisitor(db, params);

	if (!viewer) {
		return null;
	}

	if (!viewer.contactId) {
		return {
			visitorId: viewer.id,
			contactId: null,
			visitorIds: [viewer.id],
			isContactScoped: false,
		};
	}

	const linkedVisitors = await db
		.select({
			id: visitor.id,
		})
		.from(visitor)
		.innerJoin(
			contact,
			and(
				eq(visitor.contactId, contact.id),
				eq(contact.id, viewer.contactId),
				eq(contact.organizationId, params.organizationId),
				eq(contact.websiteId, params.websiteId),
				isNull(contact.deletedAt)
			)
		)
		.where(
			and(
				eq(visitor.organizationId, params.organizationId),
				eq(visitor.websiteId, params.websiteId),
				eq(visitor.contactId, viewer.contactId),
				isNull(visitor.deletedAt)
			)
		);

	const visitorIds = [
		...new Set([viewer.id, ...linkedVisitors.map((row) => row.id)]),
	];

	return {
		visitorId: viewer.id,
		contactId: viewer.contactId,
		visitorIds,
		isContactScoped: true,
	};
}

export async function getConversationVisibleVisitorIds(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		visitorId: string;
	}
): Promise<string[]> {
	return (await resolveVisitorConversationScope(db, params))?.visitorIds ?? [];
}

export async function canVisitorAccessConversation(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		viewerVisitorId: string;
		conversationVisitorId: string | null;
	}
): Promise<boolean> {
	if (!params.conversationVisitorId) {
		return false;
	}

	const viewer = await getConversationAccessVisitor(db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		visitorId: params.viewerVisitorId,
	});

	if (!viewer) {
		return false;
	}

	if (viewer.id === params.conversationVisitorId) {
		return true;
	}

	if (!viewer.contactId) {
		return false;
	}

	const owner = await getConversationAccessVisitor(db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		visitorId: params.conversationVisitorId,
	});

	return Boolean(owner?.contactId && owner.contactId === viewer.contactId);
}

export async function getConversationDeliveryVisitorIds(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		conversationVisitorId: string | null;
	}
): Promise<string[]> {
	if (!params.conversationVisitorId) {
		return [];
	}

	return getConversationVisibleVisitorIds(db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		visitorId: params.conversationVisitorId,
	});
}
