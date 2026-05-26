import type { Database } from "@api/db";
import { member, user, website, websiteOpenRouterKey } from "@api/db/schema";
import type {
	OpenRouterByokConnectionStatus,
	WebsiteOpenRouterKeySelect,
} from "@api/db/schema/openrouter-byok";
import { generateULID } from "@api/utils/db/ids";
import { and, eq, isNull } from "drizzle-orm";

export type OpenRouterByokPublicState = {
	enabled: boolean;
	hasKey: boolean;
	maskedKey: string | null;
	lastConnectionStatus: OpenRouterByokConnectionStatus;
	lastErrorCode: string | null;
	lastCheckedAt: string | null;
	fallbackPausedUntil: string | null;
	updatedAt: string | null;
};

export type OpenRouterByokAlertConfig = {
	enabled: boolean;
	maskedKey: string;
	website: {
		id: string;
		name: string;
		slug: string;
		domain: string;
	};
};

export type OpenRouterByokAlertRecipient = {
	memberId: string;
	userId: string;
	name: string;
	email: string;
};

function roleIncludesOwner(role: string): boolean {
	return role
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.includes("owner");
}

export function toOpenRouterByokPublicState(
	record: WebsiteOpenRouterKeySelect | null | undefined
): OpenRouterByokPublicState {
	return {
		enabled: record?.enabled ?? false,
		hasKey: Boolean(record),
		maskedKey: record?.maskedKey ?? null,
		lastConnectionStatus: record?.lastConnectionStatus ?? "unchecked",
		lastErrorCode: record?.lastErrorCode ?? null,
		lastCheckedAt: record?.lastCheckedAt ?? null,
		fallbackPausedUntil: record?.fallbackPausedUntil ?? null,
		updatedAt: record?.updatedAt ?? null,
	};
}

export async function getWebsiteOpenRouterKey(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
	}
): Promise<WebsiteOpenRouterKeySelect | null> {
	const [record] = await db
		.select()
		.from(websiteOpenRouterKey)
		.where(
			and(
				eq(websiteOpenRouterKey.organizationId, params.organizationId),
				eq(websiteOpenRouterKey.websiteId, params.websiteId)
			)
		)
		.limit(1);

	return record ?? null;
}

export async function getWebsiteOpenRouterByokAlertConfig(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
	}
): Promise<OpenRouterByokAlertConfig | null> {
	const [record] = await db
		.select({
			enabled: websiteOpenRouterKey.enabled,
			maskedKey: websiteOpenRouterKey.maskedKey,
			websiteId: website.id,
			websiteName: website.name,
			websiteSlug: website.slug,
			websiteDomain: website.domain,
		})
		.from(websiteOpenRouterKey)
		.innerJoin(website, eq(websiteOpenRouterKey.websiteId, website.id))
		.where(
			and(
				eq(websiteOpenRouterKey.organizationId, params.organizationId),
				eq(websiteOpenRouterKey.websiteId, params.websiteId),
				eq(website.organizationId, params.organizationId),
				isNull(website.deletedAt)
			)
		)
		.limit(1);

	if (!record) {
		return null;
	}

	return {
		enabled: record.enabled,
		maskedKey: record.maskedKey,
		website: {
			id: record.websiteId,
			name: record.websiteName,
			slug: record.websiteSlug,
			domain: record.websiteDomain,
		},
	};
}

export async function getOrganizationOwnerEmailRecipients(
	db: Database,
	params: {
		organizationId: string;
	}
): Promise<OpenRouterByokAlertRecipient[]> {
	const rows = await db
		.select({
			memberId: member.id,
			userId: user.id,
			name: user.name,
			email: user.email,
			role: member.role,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, params.organizationId));

	return rows
		.filter((row) => roleIncludesOwner(row.role) && row.email.trim().length > 0)
		.map((row) => ({
			memberId: row.memberId,
			userId: row.userId,
			name: row.name,
			email: row.email,
		}));
}

export async function upsertWebsiteOpenRouterKey(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		encryptedApiKey: string;
		maskedKey: string;
		userId: string;
	}
): Promise<WebsiteOpenRouterKeySelect> {
	const now = new Date().toISOString();
	const [record] = await db
		.insert(websiteOpenRouterKey)
		.values({
			id: generateULID(),
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			enabled: true,
			encryptedApiKey: params.encryptedApiKey,
			maskedKey: params.maskedKey,
			lastConnectionStatus: "unchecked",
			lastErrorCode: null,
			lastCheckedAt: null,
			fallbackPausedUntil: null,
			createdBy: params.userId,
			updatedBy: params.userId,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: websiteOpenRouterKey.websiteId,
			set: {
				enabled: true,
				encryptedApiKey: params.encryptedApiKey,
				maskedKey: params.maskedKey,
				lastConnectionStatus: "unchecked",
				lastErrorCode: null,
				lastCheckedAt: null,
				fallbackPausedUntil: null,
				updatedBy: params.userId,
				updatedAt: now,
			},
		})
		.returning();

	if (!record) {
		throw new Error("Failed to upsert OpenRouter key.");
	}

	return record;
}

export async function setWebsiteOpenRouterKeyEnabled(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		enabled: boolean;
		userId: string;
	}
): Promise<WebsiteOpenRouterKeySelect | null> {
	const [record] = await db
		.update(websiteOpenRouterKey)
		.set({
			enabled: params.enabled,
			fallbackPausedUntil: params.enabled ? null : undefined,
			updatedBy: params.userId,
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(websiteOpenRouterKey.organizationId, params.organizationId),
				eq(websiteOpenRouterKey.websiteId, params.websiteId)
			)
		)
		.returning();

	return record ?? null;
}

export async function deleteWebsiteOpenRouterKey(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
	}
): Promise<boolean> {
	const deleted = await db
		.delete(websiteOpenRouterKey)
		.where(
			and(
				eq(websiteOpenRouterKey.organizationId, params.organizationId),
				eq(websiteOpenRouterKey.websiteId, params.websiteId)
			)
		)
		.returning({ id: websiteOpenRouterKey.id });

	return deleted.length > 0;
}

export async function markWebsiteOpenRouterKeyConnectionStatus(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		status: OpenRouterByokConnectionStatus;
		errorCode?: string | null;
		checkedAt?: string;
		fallbackPausedUntil?: string | null;
	}
): Promise<WebsiteOpenRouterKeySelect | null> {
	const checkedAt = params.checkedAt ?? new Date().toISOString();
	const [record] = await db
		.update(websiteOpenRouterKey)
		.set({
			lastConnectionStatus: params.status,
			lastErrorCode: params.errorCode ?? null,
			lastCheckedAt: checkedAt,
			fallbackPausedUntil:
				params.fallbackPausedUntil === undefined
					? params.status === "valid"
						? null
						: undefined
					: params.fallbackPausedUntil,
			updatedAt: checkedAt,
		})
		.where(
			and(
				eq(websiteOpenRouterKey.organizationId, params.organizationId),
				eq(websiteOpenRouterKey.websiteId, params.websiteId)
			)
		)
		.returning();

	return record ?? null;
}
