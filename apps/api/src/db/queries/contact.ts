/** biome-ignore-all lint/nursery/noUnnecessaryConditions: false positive */
import { DEFAULT_PAGE_LIMIT } from "@api/constants";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import type { Database } from "..";
import {
	type ContactInsert,
	type ContactOrganizationInsert,
	type ContactOrganizationSelect,
	type ContactSelect,
	contact,
	contactOrganization,
	visitor,
} from "../schema";

export type ContactRecord = ContactSelect;
export type ContactOrganizationRecord = ContactOrganizationSelect;

/**
 * Find a contact by ID within a website
 */
export async function findContactForWebsite(
	db: Database,
	params: {
		contactId: string;
		websiteId: string;
	}
): Promise<ContactRecord | null> {
	const [result] = await db
		.select()
		.from(contact)
		.where(
			and(
				eq(contact.id, params.contactId),
				eq(contact.websiteId, params.websiteId),
				isNull(contact.deletedAt)
			)
		)
		.limit(1);

	return result ?? null;
}

/**
 * Find a contact by external ID within a website
 */
export async function findContactByExternalId(
	db: Database,
	params: {
		externalId: string;
		websiteId: string;
	}
): Promise<ContactRecord | null> {
	const [result] = await db
		.select()
		.from(contact)
		.where(
			and(
				eq(contact.externalId, params.externalId),
				eq(contact.websiteId, params.websiteId),
				isNull(contact.deletedAt)
			)
		)
		.limit(1);

	return result ?? null;
}

/**
 * Find a contact by email within a website
 */
export async function findContactByEmail(
	db: Database,
	params: {
		email: string;
		websiteId: string;
	}
): Promise<ContactRecord | null> {
	const [result] = await db
		.select()
		.from(contact)
		.where(
			and(
				eq(contact.email, params.email),
				eq(contact.websiteId, params.websiteId),
				isNull(contact.deletedAt)
			)
		)
		.limit(1);

	return result ?? null;
}

/**
 * Get the contact associated with a visitor
 */
export async function getContactForVisitor(
	db: Database,
	params: {
		visitorId: string;
		websiteId: string;
	}
): Promise<ContactRecord | null> {
	const [result] = await db
		.select({
			id: contact.id,
			websiteId: contact.websiteId,
			email: contact.email,
			name: contact.name,
			image: contact.image,
			externalId: contact.externalId,
			metadata: contact.metadata,
			featureFlags: contact.featureFlags,
			onboardingState: contact.onboardingState,
			organizationId: contact.organizationId,
			contactOrganizationId: contact.contactOrganizationId,
			userId: contact.userId,
			createdAt: contact.createdAt,
			updatedAt: contact.updatedAt,
			deletedAt: contact.deletedAt,
			notificationSettings: contact.notificationSettings,
		})
		.from(contact)
		.innerJoin(visitor, eq(visitor.contactId, contact.id))
		.where(
			and(
				eq(visitor.id, params.visitorId),
				eq(visitor.websiteId, params.websiteId),
				eq(contact.websiteId, params.websiteId),
				isNull(visitor.deletedAt),
				isNull(contact.deletedAt),
				isNotNull(visitor.contactId)
			)
		)
		.limit(1);

	return result ?? null;
}

/**
 * Create a new contact
 */
export async function createContact(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
		data: Partial<ContactInsert>;
	}
): Promise<ContactRecord> {
	const now = new Date().toISOString();

	const [newContact] = await db
		.insert(contact)
		.values({
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			...params.data,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!newContact) {
		throw new Error("Failed to create contact");
	}

	return newContact;
}

export type UpsertContactByExternalIdResult = {
	status: "created" | "updated";
	contact: ContactRecord;
};

/**
 * Idempotently create or update a contact keyed by externalId + websiteId.
 */
export async function upsertContactByExternalId(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
		externalId: string;
		email?: string;
		name?: string;
		image?: string;
		metadata?: Record<string, unknown>;
		contactOrganizationId?: string;
	}
): Promise<UpsertContactByExternalIdResult> {
	const now = new Date().toISOString();

	const [created] = await db
		.insert(contact)
		.values({
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			externalId: params.externalId,
			email: params.email,
			name: params.name,
			image: params.image,
			metadata: params.metadata,
			contactOrganizationId: params.contactOrganizationId,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({
			target: [contact.externalId, contact.websiteId],
		})
		.returning();

	if (created) {
		return {
			status: "created",
			contact: created,
		};
	}

	const updateData: Partial<ContactInsert> = {
		updatedAt: now,
		deletedAt: null,
	};

	if (params.externalId !== undefined) {
		updateData.externalId = params.externalId;
	}
	if (params.email !== undefined) {
		updateData.email = params.email;
	}
	if (params.name !== undefined) {
		updateData.name = params.name;
	}
	if (params.image !== undefined) {
		updateData.image = params.image;
	}
	if (params.contactOrganizationId !== undefined) {
		updateData.contactOrganizationId = params.contactOrganizationId;
	}
	if (params.metadata !== undefined) {
		updateData.metadata =
			sql`coalesce(${contact.metadata}, '{}'::jsonb) || ${JSON.stringify(params.metadata)}::jsonb` as ContactInsert["metadata"];
	}

	const [updated] = await db
		.update(contact)
		.set(updateData)
		.where(
			and(
				eq(contact.externalId, params.externalId),
				eq(contact.websiteId, params.websiteId)
			)
		)
		.returning();

	if (!updated) {
		throw new Error("Failed to upsert contact by externalId");
	}

	return {
		status: "updated",
		contact: updated,
	};
}

/**
 * Update an existing contact
 */
export async function updateContact(
	db: Database,
	params: {
		contactId: string;
		websiteId: string;
		data: Partial<ContactInsert>;
	}
): Promise<ContactRecord | null> {
	const now = new Date().toISOString();

	const [updated] = await db
		.update(contact)
		.set({
			...params.data,
			updatedAt: now,
		})
		.where(
			and(
				eq(contact.id, params.contactId),
				eq(contact.websiteId, params.websiteId),
				isNull(contact.deletedAt)
			)
		)
		.returning();

	return updated ?? null;
}

/**
 * Merge metadata into an existing contact
 */
export async function mergeContactMetadata(
	db: Database,
	params: {
		contactId: string;
		websiteId: string;
		metadata: NonNullable<ContactInsert["metadata"]>;
	}
): Promise<ContactRecord | null> {
	const existing = await findContactForWebsite(db, {
		contactId: params.contactId,
		websiteId: params.websiteId,
	});

	if (!existing) {
		return null;
	}

	const existingMetadata =
		typeof existing.metadata === "object" && existing.metadata !== null
			? (existing.metadata as Record<string, unknown>)
			: {};

	const mergedMetadata = {
		...existingMetadata,
		...params.metadata,
	};

	return updateContact(db, {
		contactId: params.contactId,
		websiteId: params.websiteId,
		data: {
			metadata: mergedMetadata,
		},
	});
}

/**
 * Soft delete a contact
 */
export async function deleteContact(
	db: Database,
	params: {
		contactId: string;
		websiteId: string;
	}
): Promise<ContactRecord | null> {
	const now = new Date().toISOString();

	const [deleted] = await db
		.update(contact)
		.set({
			deletedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(contact.id, params.contactId),
				eq(contact.websiteId, params.websiteId),
				isNull(contact.deletedAt)
			)
		)
		.returning();

	return deleted ?? null;
}

/**
 * Soft delete all active contacts scoped to a website and organization.
 */
export async function deleteContactsForWebsite(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<number> {
	const now = new Date().toISOString();

	const deleted = await db
		.update(contact)
		.set({
			deletedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(contact.websiteId, params.websiteId),
				eq(contact.organizationId, params.organizationId),
				isNull(contact.deletedAt)
			)
		)
		.returning({ id: contact.id });

	return deleted.length;
}

/**
 * Link a visitor to a contact
 */
export async function linkVisitorToContact(
	db: Database,
	params: {
		visitorId: string;
		contactId: string;
		websiteId: string;
	}
): Promise<void> {
	const now = new Date().toISOString();

	await db
		.update(visitor)
		.set({
			contactId: params.contactId,
			updatedAt: now,
		})
		.where(
			and(
				eq(visitor.id, params.visitorId),
				eq(visitor.websiteId, params.websiteId),
				isNull(visitor.deletedAt)
			)
		);
}

/**
 * Identify or update a contact (upsert based on externalId or email)
 * This is the main function for the "identify" endpoint
 */
export async function identifyContact(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
		externalId?: string;
		email?: string;
		name?: string;
		image?: string;
		metadata?: Record<string, unknown>;
		contactOrganizationId?: string;
	}
): Promise<ContactRecord> {
	const now = new Date().toISOString();

	if (params.externalId) {
		const result = await upsertContactByExternalId(db, {
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			externalId: params.externalId,
			email: params.email,
			name: params.name,
			image: params.image,
			metadata: params.metadata,
			contactOrganizationId: params.contactOrganizationId,
		});

		return result.contact;
	}

	// Try to find existing contact by email
	let existingContact: ContactRecord | null = null;
	if (params.email) {
		existingContact = await findContactByEmail(db, {
			email: params.email,
			websiteId: params.websiteId,
		});
	}

	if (existingContact) {
		// Update existing contact
		const updateData: Partial<ContactInsert> = {
			updatedAt: now,
		};

		if (params.externalId) {
			updateData.externalId = params.externalId;
		}
		if (params.email) {
			updateData.email = params.email;
		}
		if (params.name) {
			updateData.name = params.name;
		}
		if (params.image) {
			updateData.image = params.image;
		}
		if (params.contactOrganizationId) {
			updateData.contactOrganizationId = params.contactOrganizationId;
		}
		if (params.metadata) {
			// Merge metadata
			const existingMetadata =
				typeof existingContact.metadata === "object" &&
				existingContact.metadata !== null
					? (existingContact.metadata as Record<string, unknown>)
					: {};

			updateData.metadata = {
				...existingMetadata,
				...params.metadata,
			};
		}

		const [updated] = await db
			.update(contact)
			.set(updateData)
			.where(eq(contact.id, existingContact.id))
			.returning();

		if (!updated) {
			throw new Error("Failed to update contact");
		}

		return updated;
	}

	// Create new contact
	const [newContact] = await db
		.insert(contact)
		.values({
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			externalId: params.externalId,
			email: params.email,
			name: params.name,
			image: params.image,
			metadata: params.metadata,
			contactOrganizationId: params.contactOrganizationId,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!newContact) {
		throw new Error("Failed to insert contact");
	}

	return newContact;
}

export async function listContacts(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
		page?: number;
		limit?: number;
		search?: string | null;
		sortBy?:
			| "name"
			| "email"
			| "createdAt"
			| "updatedAt"
			| "visitorCount"
			| "lastSeenAt";
		sortOrder?: "asc" | "desc";
		visitorStatus?: "withVisitors" | "withoutVisitors";
	}
) {
	const page = Math.max(params.page ?? 1, 1);
	const limit = Math.min(params.limit ?? DEFAULT_PAGE_LIMIT, 100);
	const offset = (page - 1) * limit;

	const whereConditions = [
		eq(contact.websiteId, params.websiteId),
		eq(contact.organizationId, params.organizationId),
		isNull(contact.deletedAt),
	];

	const searchTerm = params.search?.trim();
	if (searchTerm) {
		const likeTerm = `%${searchTerm}%`;
		const searchCondition = or(
			ilike(contact.email, likeTerm),
			ilike(contact.name, likeTerm)
		);
		if (searchCondition) {
			whereConditions.push(searchCondition);
		}
	}

	// Subquery to get visitor counts per contact
	const visitorCounts = db
		.select({
			contactId: visitor.contactId,
			total: count().as("total"),
		})
		.from(visitor)
		.where(
			and(
				eq(visitor.websiteId, params.websiteId),
				eq(visitor.organizationId, params.organizationId),
				isNull(visitor.deletedAt),
				isNotNull(visitor.contactId)
			)
		)
		.groupBy(visitor.contactId)
		.as("visitor_counts");

	// Subquery to get max lastSeenAt per contact from all their visitors
	const visitorLastSeen = db
		.select({
			contactId: visitor.contactId,
			maxLastSeenAt: sql<string>`MAX(${visitor.lastSeenAt})`.as(
				"max_last_seen_at"
			),
		})
		.from(visitor)
		.where(
			and(
				eq(visitor.websiteId, params.websiteId),
				eq(visitor.organizationId, params.organizationId),
				isNull(visitor.deletedAt),
				isNotNull(visitor.contactId),
				isNotNull(visitor.lastSeenAt)
			)
		)
		.groupBy(visitor.contactId)
		.as("visitor_last_seen");

	const baseWhereClause = and(...whereConditions);

	const visitorFilter = (() => {
		if (params.visitorStatus === "withVisitors") {
			return isNotNull(visitorCounts.contactId);
		}

		if (params.visitorStatus === "withoutVisitors") {
			return isNull(visitorCounts.contactId);
		}

		return null;
	})();

	const whereClause = visitorFilter
		? and(baseWhereClause, visitorFilter)
		: baseWhereClause;

	const totalCountResult = await db
		.select({ totalCount: count() })
		.from(contact)
		.leftJoin(visitorCounts, eq(visitorCounts.contactId, contact.id))
		.where(whereClause);

	const sortBy = params.sortBy ?? "updatedAt";
	const sortOrder = params.sortOrder ?? "desc";
	const orderFn = sortOrder === "asc" ? asc : desc;

	const visitorCountColumn = sql<number>`COALESCE(${visitorCounts.total}, 0)::int`;
	const lastSeenAtColumn = sql<string | null>`${visitorLastSeen.maxLastSeenAt}`;

	const orderColumn = (() => {
		switch (sortBy) {
			case "name":
				return contact.name;
			case "email":
				return contact.email;
			case "createdAt":
				return contact.createdAt;
			case "visitorCount":
				return visitorCountColumn;
			case "lastSeenAt":
				return lastSeenAtColumn;
			default:
				return contact.updatedAt;
		}
	})();

	const rows = await db
		.select({
			id: contact.id,
			name: contact.name,
			email: contact.email,
			image: contact.image,
			createdAt: contact.createdAt,
			updatedAt: contact.updatedAt,
			visitorCount: visitorCountColumn,
			lastSeenAt: lastSeenAtColumn,
			contactOrganizationId: contact.contactOrganizationId,
			contactOrganizationName: contactOrganization.name,
		})
		.from(contact)
		.leftJoin(visitorCounts, eq(visitorCounts.contactId, contact.id))
		.leftJoin(visitorLastSeen, eq(visitorLastSeen.contactId, contact.id))
		.leftJoin(
			contactOrganization,
			eq(contactOrganization.id, contact.contactOrganizationId)
		)
		.where(whereClause)
		.orderBy(orderFn(orderColumn), desc(contact.id))
		.limit(limit)
		.offset(offset);

	const numericTotalCount = Number(totalCountResult.at(0)?.totalCount ?? 0);

	return {
		items: rows.map((row) => ({
			id: row.id,
			name: row.name,
			email: row.email,
			image: row.image,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			visitorCount: Number(row.visitorCount ?? 0),
			lastSeenAt: row.lastSeenAt ?? null,
			contactOrganizationId: row.contactOrganizationId ?? null,
			contactOrganizationName: row.contactOrganizationName ?? null,
		})),
		totalCount: numericTotalCount,
		page,
		pageSize: limit,
	};
}

export async function getContactWithVisitors(
	db: Database,
	params: {
		contactId: string;
		websiteId: string;
		organizationId: string;
	}
) {
	// Select only the fields needed for contactResponseSchema
	const [contactRecord] = await db
		.select({
			id: contact.id,
			externalId: contact.externalId,
			name: contact.name,
			email: contact.email,
			image: contact.image,
			metadata: contact.metadata,
			contactOrganizationId: contact.contactOrganizationId,
			websiteId: contact.websiteId,
			organizationId: contact.organizationId,
			userId: contact.userId,
			createdAt: contact.createdAt,
			updatedAt: contact.updatedAt,
		})
		.from(contact)
		.where(
			and(
				eq(contact.id, params.contactId),
				eq(contact.websiteId, params.websiteId),
				eq(contact.organizationId, params.organizationId),
				isNull(contact.deletedAt)
			)
		)
		.limit(1);

	if (!contactRecord) {
		return null;
	}

	const visitorsList = await db
		.select({
			id: visitor.id,
			lastSeenAt: visitor.lastSeenAt,
			createdAt: visitor.createdAt,
			browser: visitor.browser,
			device: visitor.device,
			country: visitor.country,
			city: visitor.city,
			language: visitor.language,
			blockedAt: visitor.blockedAt,
			blockedByUserId: visitor.blockedByUserId,
		})
		.from(visitor)
		.where(
			and(
				eq(visitor.contactId, contactRecord.id),
				eq(visitor.websiteId, params.websiteId),
				eq(visitor.organizationId, params.organizationId),
				isNull(visitor.deletedAt)
			)
		)
		.orderBy(desc(visitor.lastSeenAt), desc(visitor.createdAt));

	// Helper to convert Date or string to ISO string with Z suffix
	// z.string().datetime() requires strict ISO 8601 format ending with Z
	const toISOString = (value: Date | string | null): string | null => {
		if (value === null) {
			return null;
		}
		if (value instanceof Date) {
			return value.toISOString();
		}
		// If it's a string (e.g. from cache), re-parse to ensure correct ISO format
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return date.toISOString();
		}
		return value;
	};

	return {
		contact: {
			id: contactRecord.id,
			externalId: contactRecord.externalId || null,
			name: contactRecord.name || null,
			// Use || to convert empty strings to null (z.email() fails on "")
			email: contactRecord.email || null,
			// Use || to convert empty strings to null (z.url() fails on "")
			image: contactRecord.image || null,
			metadata:
				typeof contactRecord.metadata === "object" &&
				contactRecord.metadata !== null
					? (contactRecord.metadata as Record<
							string,
							string | number | boolean | null
						>)
					: null,
			contactOrganizationId: contactRecord.contactOrganizationId || null,
			websiteId: contactRecord.websiteId,
			organizationId: contactRecord.organizationId,
			userId: contactRecord.userId || null,
			createdAt: toISOString(contactRecord.createdAt) || "",
			updatedAt: toISOString(contactRecord.updatedAt) || "",
		},
		visitors: visitorsList.map((visitorRecord) => ({
			id: visitorRecord.id,
			lastSeenAt: toISOString(visitorRecord.lastSeenAt),
			createdAt: toISOString(visitorRecord.createdAt) || "",
			browser: visitorRecord.browser || null,
			device: visitorRecord.device || null,
			country: visitorRecord.country || null,
			city: visitorRecord.city || null,
			language: visitorRecord.language || null,
			blockedAt: toISOString(visitorRecord.blockedAt),
			blockedByUserId: visitorRecord.blockedByUserId || null,
			isBlocked: visitorRecord.blockedAt !== null,
		})),
	};
}

// Contact Organisation queries

/**
 * Find a contact organization by ID within a website
 */
export async function findContactOrganizationForWebsite(
	db: Database,
	params: {
		contactOrganizationId: string;
		websiteId: string;
	}
): Promise<ContactOrganizationRecord | null> {
	const [result] = await db
		.select()
		.from(contactOrganization)
		.where(
			and(
				eq(contactOrganization.id, params.contactOrganizationId),
				eq(contactOrganization.websiteId, params.websiteId),
				isNull(contactOrganization.deletedAt)
			)
		)
		.limit(1);

	return result ?? null;
}

/**
 * Find a contact organization by external ID within a website
 */
export async function findContactOrganizationByExternalId(
	db: Database,
	params: {
		externalId: string;
		websiteId: string;
	}
): Promise<ContactOrganizationRecord | null> {
	const [result] = await db
		.select()
		.from(contactOrganization)
		.where(
			and(
				eq(contactOrganization.externalId, params.externalId),
				eq(contactOrganization.websiteId, params.websiteId),
				isNull(contactOrganization.deletedAt)
			)
		)
		.limit(1);

	return result ?? null;
}

/**
 * Create a new contact organization
 */
export async function createContactOrganization(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
		data: Partial<ContactOrganizationInsert> & { name: string };
	}
): Promise<ContactOrganizationRecord> {
	const now = new Date().toISOString();

	const [newContactOrganization] = await db
		.insert(contactOrganization)
		.values({
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			...params.data,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!newContactOrganization) {
		throw new Error("Failed to create contact organization");
	}

	return newContactOrganization;
}

/**
 * Update an existing contact organization
 */
export async function updateContactOrganization(
	db: Database,
	params: {
		contactOrganizationId: string;
		websiteId: string;
		data: Partial<ContactOrganizationInsert>;
	}
): Promise<ContactOrganizationRecord | null> {
	const now = new Date().toISOString();

	const [updated] = await db
		.update(contactOrganization)
		.set({
			...params.data,
			updatedAt: now,
		})
		.where(
			and(
				eq(contactOrganization.id, params.contactOrganizationId),
				eq(contactOrganization.websiteId, params.websiteId),
				isNull(contactOrganization.deletedAt)
			)
		)
		.returning();

	return updated ?? null;
}

/**
 * Soft delete a contact organization
 */
export async function deleteContactOrganization(
	db: Database,
	params: {
		contactOrganizationId: string;
		websiteId: string;
	}
): Promise<ContactOrganizationRecord | null> {
	const now = new Date().toISOString();

	const [deleted] = await db
		.update(contactOrganization)
		.set({
			deletedAt: now,
		})
		.where(
			and(
				eq(contactOrganization.id, params.contactOrganizationId),
				eq(contactOrganization.websiteId, params.websiteId),
				isNull(contactOrganization.deletedAt)
			)
		)
		.returning();

	return deleted ?? null;
}
