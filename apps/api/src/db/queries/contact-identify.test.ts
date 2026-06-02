import { describe, expect, it, mock } from "bun:test";
import { contact } from "../schema";
import {
	deleteContactsForWebsite,
	identifyContact,
	upsertContactByExternalId,
} from "./contact";

describe("upsertContactByExternalId", () => {
	it("returns created when insert succeeds", async () => {
		const createdContact = {
			id: "contact-created",
			websiteId: "site-1",
			organizationId: "org-1",
			externalId: "user-123",
			email: "user@example.com",
			name: "User",
			image: null,
			metadata: null,
			featureFlags: null,
			onboardingState: null,
			contactOrganizationId: null,
			userId: null,
			createdAt: "2026-02-24T01:00:00.000Z",
			updatedAt: "2026-02-24T01:00:00.000Z",
			deletedAt: null,
			notificationSettings: null,
		};

		const returningMock = mock((async () => [createdContact]) as () => Promise<
			unknown[]
		>);
		const onConflictDoNothingMock = mock((() => ({
			returning: returningMock,
		})) as (args: unknown) => { returning: () => Promise<unknown[]> });
		const valuesMock = mock((() => ({
			onConflictDoNothing: onConflictDoNothingMock,
		})) as (values: unknown) => {
			onConflictDoNothing: (args: unknown) => {
				returning: () => Promise<unknown[]>;
			};
		});
		const insertMock = mock((() => ({
			values: valuesMock,
		})) as (table: unknown) => {
			values: (values: unknown) => {
				onConflictDoNothing: (args: unknown) => {
					returning: () => Promise<unknown[]>;
				};
			};
		});
		const updateMock = mock(() => {
			throw new Error("update should not be called");
		});

		const db = {
			insert: insertMock,
			update: updateMock,
		};

		const result = await upsertContactByExternalId(db as never, {
			websiteId: "site-1",
			organizationId: "org-1",
			externalId: "user-123",
			email: "user@example.com",
			name: "User",
		});

		expect(result).toEqual({
			status: "created",
			contact: createdContact,
		});
		expect(onConflictDoNothingMock).toHaveBeenCalledTimes(1);
		const conflictArg = onConflictDoNothingMock.mock.calls[0]?.[0] as {
			target: unknown[];
		};
		expect(conflictArg.target).toEqual([contact.externalId, contact.websiteId]);
		expect(updateMock).toHaveBeenCalledTimes(0);
	});

	it("falls back to update when insert conflicts and merges metadata", async () => {
		const updatedContact = {
			id: "contact-existing",
			websiteId: "site-1",
			organizationId: "org-1",
			externalId: "user-123",
			email: "new@example.com",
			name: "Updated Name",
			image: null,
			metadata: { plan: "pro", role: "admin" },
			featureFlags: null,
			onboardingState: null,
			contactOrganizationId: null,
			userId: null,
			createdAt: "2026-02-23T01:00:00.000Z",
			updatedAt: "2026-02-24T01:00:00.000Z",
			deletedAt: null,
			notificationSettings: null,
		};

		const insertReturningMock = mock((async () => []) as () => Promise<
			unknown[]
		>);
		const onConflictDoNothingMock = mock((() => ({
			returning: insertReturningMock,
		})) as (args: unknown) => { returning: () => Promise<unknown[]> });
		const valuesMock = mock((() => ({
			onConflictDoNothing: onConflictDoNothingMock,
		})) as (values: unknown) => {
			onConflictDoNothing: (args: unknown) => {
				returning: () => Promise<unknown[]>;
			};
		});
		const insertMock = mock((() => ({
			values: valuesMock,
		})) as (table: unknown) => {
			values: (values: unknown) => {
				onConflictDoNothing: (args: unknown) => {
					returning: () => Promise<unknown[]>;
				};
			};
		});

		const updateReturningMock = mock((async () => [
			updatedContact,
		]) as () => Promise<unknown[]>);
		const updateWhereMock = mock((() => ({
			returning: updateReturningMock,
		})) as (where: unknown) => { returning: () => Promise<unknown[]> });
		const updateSetMock = mock((() => ({
			where: updateWhereMock,
		})) as (set: unknown) => {
			where: (where: unknown) => { returning: () => Promise<unknown[]> };
		});
		const updateMock = mock((() => ({
			set: updateSetMock,
		})) as (table: unknown) => {
			set: (set: unknown) => {
				where: (where: unknown) => { returning: () => Promise<unknown[]> };
			};
		});

		const db = {
			insert: insertMock,
			update: updateMock,
		};

		const result = await upsertContactByExternalId(db as never, {
			websiteId: "site-1",
			organizationId: "org-1",
			externalId: "user-123",
			email: "new@example.com",
			name: "Updated Name",
			metadata: { plan: "pro", role: "admin" },
		});

		expect(result).toEqual({
			status: "updated",
			contact: updatedContact,
		});
		expect(updateSetMock).toHaveBeenCalledTimes(1);

		const updateArg = updateSetMock.mock.calls[0]?.[0] as {
			updatedAt: string;
			deletedAt: null;
			metadata: { queryChunks?: unknown[] };
		};

		expect(updateArg.updatedAt).toEqual(expect.any(String));
		expect(updateArg.deletedAt).toBeNull();
		expect(Array.isArray(updateArg.metadata.queryChunks)).toBe(true);
		expect((updateArg.metadata.queryChunks ?? []).length).toBeGreaterThan(0);
	});
});

describe("deleteContactsForWebsite", () => {
	it("soft deletes active contacts scoped to website and organization", async () => {
		const returningMock = mock((async () => [
			{ id: "contact-1" },
			{ id: "contact-2" },
		]) as (fields: unknown) => Promise<unknown[]>);
		const updateWhereMock = mock((() => ({
			returning: returningMock,
		})) as (where: unknown) => {
			returning: (fields: unknown) => Promise<unknown[]>;
		});
		const updateSetMock = mock((() => ({
			where: updateWhereMock,
		})) as (set: unknown) => {
			where: (where: unknown) => {
				returning: (fields: unknown) => Promise<unknown[]>;
			};
		});
		const updateMock = mock((() => ({
			set: updateSetMock,
		})) as (table: unknown) => {
			set: (set: unknown) => {
				where: (where: unknown) => {
					returning: (fields: unknown) => Promise<unknown[]>;
				};
			};
		});

		const db = {
			update: updateMock,
		};

		const deletedCount = await deleteContactsForWebsite(db as never, {
			websiteId: "site-1",
			organizationId: "org-1",
		});

		expect(deletedCount).toBe(2);
		expect(updateMock).toHaveBeenCalledWith(contact);
		expect(updateSetMock).toHaveBeenCalledTimes(1);
		const updateArg = updateSetMock.mock.calls[0]?.[0] as {
			deletedAt: string;
			updatedAt: string;
		};
		expect(updateArg.deletedAt).toEqual(expect.any(String));
		expect(updateArg.updatedAt).toEqual(expect.any(String));
		expect(updateWhereMock).toHaveBeenCalledTimes(1);
		expect(returningMock).toHaveBeenCalledWith({ id: contact.id });
	});
});

describe("identifyContact", () => {
	it("keeps email-only update path and merges metadata in-memory", async () => {
		const existingContact = {
			id: "contact-existing",
			metadata: { plan: "basic", role: "member" },
		};
		const updatedContact = {
			id: "contact-existing",
			metadata: { plan: "pro", role: "member", seats: 3 },
		};

		const selectLimitMock = mock((async () => [
			existingContact,
		]) as () => Promise<unknown[]>);
		const selectWhereMock = mock((() => ({
			limit: selectLimitMock,
		})) as (where: unknown) => { limit: () => Promise<unknown[]> });
		const selectFromMock = mock((() => ({
			where: selectWhereMock,
		})) as (table: unknown) => {
			where: (where: unknown) => { limit: () => Promise<unknown[]> };
		});
		const selectMock = mock((() => ({
			from: selectFromMock,
		})) as () => {
			from: (table: unknown) => {
				where: (where: unknown) => { limit: () => Promise<unknown[]> };
			};
		});

		const updateReturningMock = mock((async () => [
			updatedContact,
		]) as () => Promise<unknown[]>);
		const updateWhereMock = mock((() => ({
			returning: updateReturningMock,
		})) as (where: unknown) => { returning: () => Promise<unknown[]> });
		const updateSetMock = mock((() => ({
			where: updateWhereMock,
		})) as (set: unknown) => {
			where: (where: unknown) => { returning: () => Promise<unknown[]> };
		});
		const updateMock = mock((() => ({
			set: updateSetMock,
		})) as (table: unknown) => {
			set: (set: unknown) => {
				where: (where: unknown) => { returning: () => Promise<unknown[]> };
			};
		});
		const insertMock = mock(() => {
			throw new Error("insert should not be called for email-only update path");
		});

		const db = {
			insert: insertMock,
			select: selectMock,
			update: updateMock,
		};

		const result = await identifyContact(db as never, {
			websiteId: "site-1",
			organizationId: "org-1",
			email: "user@example.com",
			metadata: { plan: "pro", seats: 3 },
		});

		expect(result).toEqual(expect.objectContaining(updatedContact));
		expect(updateSetMock).toHaveBeenCalledTimes(1);

		const updateArg = updateSetMock.mock.calls[0]?.[0] as {
			metadata: Record<string, unknown>;
		};

		expect(updateArg.metadata).toEqual({
			plan: "pro",
			role: "member",
			seats: 3,
		});
	});
});
