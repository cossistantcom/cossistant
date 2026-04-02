import { DEFAULT_PAGE_LIMIT } from "@api/constants";
import type { Database } from "@api/db";
import type {
	ApiKeySelect,
	OrganizationSelect,
	WebsiteSelect,
} from "@api/db/schema";
import { apiKey, organization, website } from "@api/db/schema";
import { env } from "@api/env";
import { generateApiKey, hashApiKey } from "@api/utils/api-keys";
import {
	API_KEY_CACHE_TAG,
	getApiKeyCacheTagForKey,
} from "@api/utils/cache/api-key-cache";
import { generateULID } from "@api/utils/db/ids";
import { APIKeyType } from "@plasma/types";
import { and, desc, eq } from "drizzle-orm";

export type CreateApiKeyResult = ApiKeySelect;

export type ApiKeyWithWebsiteAndOrganization = ApiKeySelect & {
	website: WebsiteSelect;
	organization: OrganizationSelect;
};

export async function getApiKeyByKey(
	db: Database,
	params: {
		key: string;
	}
): Promise<ApiKeyWithWebsiteAndOrganization | null> {
	const [res] = await db
		.select()
		.from(apiKey)
		.where(and(eq(apiKey.key, params.key), eq(apiKey.isActive, true)))
		.innerJoin(organization, eq(apiKey.organizationId, organization.id))
		.innerJoin(website, eq(apiKey.websiteId, website.id))
		.limit(1)
		.$withCache();

	if (res?.website && res.organization && res.api_key) {
		return {
			...res.api_key,
			website: res.website,
			organization: res.organization,
		};
	}

	return null;
}

// Get API key by ID with org check
export async function getApiKeyById(
	db: Database,
	params: {
		orgId: string;
		apiKeyId: string;
	}
) {
	const [key] = await db
		.select()
		.from(apiKey)
		.where(
			and(
				eq(apiKey.id, params.apiKeyId),
				eq(apiKey.organizationId, params.orgId)
			)
		)
		.limit(1);

	return key;
}

// Get API keys for organization
export async function getApiKeysByOrganization(
	db: Database,
	params: {
		orgId: string;
		websiteId?: string;
		keyType?: APIKeyType;
		isActive?: boolean;
		limit?: number;
		offset?: number;
	}
) {
	const keys = await db
		.select()
		.from(apiKey)
		.where(
			and(
				eq(apiKey.organizationId, params.orgId),
				params.websiteId ? eq(apiKey.websiteId, params.websiteId) : undefined,
				params.keyType ? eq(apiKey.keyType, params.keyType) : undefined,
				params.isActive !== undefined
					? eq(apiKey.isActive, params.isActive)
					: undefined
			)
		)
		.orderBy(desc(apiKey.createdAt))
		.limit(params.limit ?? DEFAULT_PAGE_LIMIT)
		.offset(params.offset ?? 0);

	return keys;
}

// Update API key
export async function updateApiKey(
	db: Database,
	params: {
		orgId: string;
		apiKeyId: string;
		data: Partial<{
			name: string;
			isActive: boolean;
			expiresAt: string | null;
		}>;
	}
) {
	const [updatedKey] = await db
		.update(apiKey)
		.set({
			...params.data,
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(apiKey.id, params.apiKeyId),
				eq(apiKey.organizationId, params.orgId)
			)
		)
		.returning();

	return updatedKey;
}

// Revoke API key
export async function revokeApiKey(
	db: Database,
	params: {
		orgId: string;
		apiKeyId: string;
		revokedBy: string;
	}
) {
	const [revokedKey] = await db
		.update(apiKey)
		.set({
			isActive: false,
			revokedAt: new Date().toISOString(),
			revokedBy: params.revokedBy,
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(apiKey.id, params.apiKeyId),
				eq(apiKey.organizationId, params.orgId)
			)
		)
		.returning();

	return revokedKey;
}

// Update API key last used
export async function updateApiKeyLastUsed(
	db: Database,
	params: {
		orgId: string;
		apiKeyId: string;
	}
) {
	const [updatedKey] = await db
		.update(apiKey)
		.set({
			lastUsedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(apiKey.id, params.apiKeyId),
				eq(apiKey.organizationId, params.orgId)
			)
		)
		.returning();

	return updatedKey;
}

export async function createApiKey(
	db: Database,
	data: {
		id: string;
		name: string;
		organizationId: string;
		websiteId: string;
		keyType: APIKeyType;
		createdBy: string;
		isTest: boolean;
	}
): Promise<CreateApiKeyResult> {
	let storedKey = "";

	// Generate key
	const rawKey = generateApiKey({
		type: data.keyType,
		isTest: data.isTest,
	});

	// Hash the key using a secret from the environment
	if (data.keyType === APIKeyType.PRIVATE) {
		storedKey = hashApiKey(rawKey, env.API_KEY_SECRET);
	} else {
		storedKey = rawKey;
	}

	// Save hashed key in database
	const [result] = await db
		.insert(apiKey)
		.values({
			id: data.id,
			name: data.name,
			key: storedKey,
			organizationId: data.organizationId,
			keyType: data.keyType,
			createdBy: data.createdBy,
			websiteId: data.websiteId,
			isActive: true,
			isTest: data.isTest,
		})
		.returning();

	// Return the raw key to the caller (not stored)
	return { ...result, key: rawKey } as CreateApiKeyResult;
}

export async function createDefaultWebsiteKeys(
	db: Database,
	data: {
		websiteId: string;
		websiteName: string;
		organizationId: string;
		createdBy: string;
	}
) {
	// Generate production / test private and public keys
	const keys = [
		{
			id: generateULID(),
			name: `${data.websiteName} - Public API Key`,
			keyType: APIKeyType.PUBLIC,
			isActive: true,
			isTest: false,
		},
		{
			id: generateULID(),
			name: `${data.websiteName} - Test Public API Key`,
			keyType: APIKeyType.PUBLIC,
			isActive: true,
			isTest: true,
		},
	];

	const result = await Promise.all(
		keys.map((key) =>
			createApiKey(db, {
				...key,
				...data,
			})
		)
	);

	return result;
}
