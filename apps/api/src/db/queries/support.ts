import type { Database } from "@api/db";
import {
	type ContactOrganizationSelect,
	type ContactSelect,
	contact,
	contactOrganization,
	type VisitorSelect,
	visitor,
} from "@api/db/schema";
import type {
	SupportFeatureFlagMutationRequest,
	SupportFeatureFlagTarget,
	SupportOnboardingState,
	SupportOnboardingUpdateRequest,
	SupportStateResponse,
} from "@cossistant/types/api/support";
import {
	applySupportOnboardingUpdate,
	normalizeSupportFeatureFlags,
	normalizeSupportOnboardingState,
} from "@cossistant/types/support-state";
import { and, eq, isNull } from "drizzle-orm";

type SupportStateRows = {
	visitor: Pick<
		VisitorSelect,
		"id" | "featureFlags" | "onboardingState" | "contactId"
	>;
	contact: Pick<
		ContactSelect,
		"id" | "featureFlags" | "onboardingState" | "contactOrganizationId"
	> | null;
	contactOrganization: Pick<
		ContactOrganizationSelect,
		"id" | "featureFlags"
	> | null;
};

export function parseFeatureFlags(value: string | null | undefined): string[] {
	if (!value) {
		return [];
	}

	return normalizeSupportFeatureFlags(value.split(","));
}

export function serializeFeatureFlags(flags: readonly string[]): string | null {
	const serialized = normalizeSupportFeatureFlags(flags).join(",");

	return serialized.length > 0 ? serialized : null;
}

function resolveFeatureFlags(rows: SupportStateRows): string[] {
	return normalizeSupportFeatureFlags([
		...parseFeatureFlags(rows.visitor.featureFlags),
		...parseFeatureFlags(rows.contact?.featureFlags),
		...parseFeatureFlags(rows.contactOrganization?.featureFlags),
	]);
}

function resolveOnboardingState(
	rows: SupportStateRows
): SupportOnboardingState {
	return normalizeSupportOnboardingState(
		rows.contact?.onboardingState ?? rows.visitor.onboardingState
	);
}

async function getSupportStateRows(
	db: Database,
	params: {
		websiteId: string;
		visitorId: string;
	}
): Promise<SupportStateRows | null> {
	const [rows] = await db
		.select({
			visitor: {
				id: visitor.id,
				featureFlags: visitor.featureFlags,
				onboardingState: visitor.onboardingState,
				contactId: visitor.contactId,
			},
			contact: {
				id: contact.id,
				featureFlags: contact.featureFlags,
				onboardingState: contact.onboardingState,
				contactOrganizationId: contact.contactOrganizationId,
			},
			contactOrganization: {
				id: contactOrganization.id,
				featureFlags: contactOrganization.featureFlags,
			},
		})
		.from(visitor)
		.leftJoin(
			contact,
			and(
				eq(visitor.contactId, contact.id),
				eq(contact.websiteId, params.websiteId),
				eq(contact.organizationId, visitor.organizationId),
				isNull(contact.deletedAt)
			)
		)
		.leftJoin(
			contactOrganization,
			and(
				eq(contact.contactOrganizationId, contactOrganization.id),
				eq(contactOrganization.websiteId, params.websiteId),
				eq(contactOrganization.organizationId, visitor.organizationId),
				isNull(contactOrganization.deletedAt)
			)
		)
		.where(
			and(
				eq(visitor.id, params.visitorId),
				eq(visitor.websiteId, params.websiteId),
				isNull(visitor.deletedAt)
			)
		)
		.limit(1);

	return rows ?? null;
}

export async function getSupportStateForVisitor(
	db: Database,
	params: {
		websiteId: string;
		visitorId: string;
	}
): Promise<SupportStateResponse | null> {
	const rows = await getSupportStateRows(db, params);

	if (!rows) {
		return null;
	}

	return {
		featureFlags: resolveFeatureFlags(rows),
		onboarding: resolveOnboardingState(rows),
	};
}

export async function updateOnboardingForVisitor(
	db: Database,
	params: {
		websiteId: string;
		visitorId: string;
		update: SupportOnboardingUpdateRequest;
	}
): Promise<SupportStateResponse | null> {
	const rows = await getSupportStateRows(db, params);

	if (!rows) {
		return null;
	}

	const current = resolveOnboardingState(rows);
	const next = applySupportOnboardingUpdate(current, params.update);

	if (rows.contact?.id) {
		await db
			.update(contact)
			.set({
				onboardingState: next,
				updatedAt: new Date().toISOString(),
			})
			.where(
				and(
					eq(contact.id, rows.contact.id),
					eq(contact.websiteId, params.websiteId),
					isNull(contact.deletedAt)
				)
			);
	} else {
		await db
			.update(visitor)
			.set({
				onboardingState: next,
				updatedAt: new Date().toISOString(),
			})
			.where(
				and(
					eq(visitor.id, params.visitorId),
					eq(visitor.websiteId, params.websiteId),
					isNull(visitor.deletedAt)
				)
			);
	}

	return getSupportStateForVisitor(db, params);
}

export async function copyVisitorOnboardingToContactIfEmpty(
	db: Database,
	params: {
		visitorId: string;
		contactId: string;
		websiteId: string;
	}
): Promise<void> {
	const rows = await getSupportStateRows(db, {
		visitorId: params.visitorId,
		websiteId: params.websiteId,
	});

	if (!rows?.visitor.onboardingState || rows.contact?.onboardingState) {
		return;
	}

	await db
		.update(contact)
		.set({
			onboardingState: normalizeSupportOnboardingState(
				rows.visitor.onboardingState
			),
			updatedAt: new Date().toISOString(),
		})
		.where(
			and(
				eq(contact.id, params.contactId),
				eq(contact.websiteId, params.websiteId),
				isNull(contact.deletedAt)
			)
		);
}

function mutateFlagList(
	current: string | null | undefined,
	request: Pick<SupportFeatureFlagMutationRequest, "operation" | "flags">
): string[] {
	const currentFlags = parseFeatureFlags(current);
	const incomingFlags = normalizeSupportFeatureFlags(request.flags);

	if (request.operation === "set") {
		return incomingFlags;
	}

	const next = new Set(currentFlags);

	for (const flag of incomingFlags) {
		if (request.operation === "add") {
			next.add(flag);
		} else {
			next.delete(flag);
		}
	}

	return Array.from(next).sort();
}

export async function listAffectedVisitorIdsForFeatureFlagTarget(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
		target: SupportFeatureFlagTarget;
	}
): Promise<string[]> {
	if (params.target.type === "visitor") {
		const [record] = await db
			.select({ id: visitor.id })
			.from(visitor)
			.where(
				and(
					eq(visitor.id, params.target.id),
					eq(visitor.websiteId, params.websiteId),
					eq(visitor.organizationId, params.organizationId),
					isNull(visitor.deletedAt)
				)
			)
			.limit(1);

		return record ? [record.id] : [];
	}

	if (params.target.type === "contact") {
		const rows = await db
			.select({ id: visitor.id })
			.from(visitor)
			.where(
				and(
					eq(visitor.contactId, params.target.id),
					eq(visitor.websiteId, params.websiteId),
					eq(visitor.organizationId, params.organizationId),
					isNull(visitor.deletedAt)
				)
			);

		return rows.map((row) => row.id);
	}

	const rows = await db
		.select({ id: visitor.id })
		.from(visitor)
		.innerJoin(contact, eq(visitor.contactId, contact.id))
		.where(
			and(
				eq(contact.contactOrganizationId, params.target.id),
				eq(contact.websiteId, params.websiteId),
				eq(contact.organizationId, params.organizationId),
				eq(visitor.websiteId, params.websiteId),
				eq(visitor.organizationId, params.organizationId),
				isNull(visitor.deletedAt),
				isNull(contact.deletedAt)
			)
		);

	return rows.map((row) => row.id);
}

export async function mutateFeatureFlagsForTarget(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
		request: SupportFeatureFlagMutationRequest;
	}
): Promise<string[] | null> {
	const { target } = params.request;
	const now = new Date().toISOString();

	if (target.type === "visitor") {
		const [visitorRecord] = await db
			.select({ featureFlags: visitor.featureFlags })
			.from(visitor)
			.where(
				and(
					eq(visitor.id, target.id),
					eq(visitor.websiteId, params.websiteId),
					eq(visitor.organizationId, params.organizationId),
					isNull(visitor.deletedAt)
				)
			)
			.limit(1);

		if (!visitorRecord) {
			return null;
		}

		const flags = mutateFlagList(visitorRecord.featureFlags, params.request);
		await db
			.update(visitor)
			.set({
				featureFlags: serializeFeatureFlags(flags),
				updatedAt: now,
			})
			.where(
				and(
					eq(visitor.id, target.id),
					eq(visitor.websiteId, params.websiteId),
					eq(visitor.organizationId, params.organizationId),
					isNull(visitor.deletedAt)
				)
			);

		return flags;
	}

	if (target.type === "contact") {
		const [contactRecord] = await db
			.select({ featureFlags: contact.featureFlags })
			.from(contact)
			.where(
				and(
					eq(contact.id, target.id),
					eq(contact.websiteId, params.websiteId),
					eq(contact.organizationId, params.organizationId),
					isNull(contact.deletedAt)
				)
			)
			.limit(1);

		if (!contactRecord) {
			return null;
		}

		const flags = mutateFlagList(contactRecord.featureFlags, params.request);
		await db
			.update(contact)
			.set({
				featureFlags: serializeFeatureFlags(flags),
				updatedAt: now,
			})
			.where(
				and(
					eq(contact.id, target.id),
					eq(contact.websiteId, params.websiteId),
					eq(contact.organizationId, params.organizationId),
					isNull(contact.deletedAt)
				)
			);

		return flags;
	}

	const [record] = await db
		.select({ featureFlags: contactOrganization.featureFlags })
		.from(contactOrganization)
		.where(
			and(
				eq(contactOrganization.id, target.id),
				eq(contactOrganization.websiteId, params.websiteId),
				eq(contactOrganization.organizationId, params.organizationId),
				isNull(contactOrganization.deletedAt)
			)
		)
		.limit(1);

	if (!record) {
		return null;
	}

	const flags = mutateFlagList(record.featureFlags, params.request);
	await db
		.update(contactOrganization)
		.set({
			featureFlags: serializeFeatureFlags(flags),
			updatedAt: now,
		})
		.where(
			and(
				eq(contactOrganization.id, target.id),
				eq(contactOrganization.websiteId, params.websiteId),
				eq(contactOrganization.organizationId, params.organizationId),
				isNull(contactOrganization.deletedAt)
			)
		);

	return flags;
}
