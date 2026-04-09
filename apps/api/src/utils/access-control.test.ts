import { describe, expect, it } from "bun:test";
import type { Database } from "@api/db";

function loadAccessControlModule() {
	return import(`./access-control.ts?test=${Math.random()}`);
}

function createDbMock(rows: Array<{ id: string }>): Database {
	return {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => ({
						$withCache: async () => rows,
					}),
				}),
			}),
		}),
	} as unknown as Database;
}

describe("access-control ownership checks", () => {
	it("returns true when owner membership exists", async () => {
		const db = createDbMock([{ id: "member_1" }]);
		const { isOrganizationOwner } = await loadAccessControlModule();

		const isOwner = await isOrganizationOwner(db, {
			userId: "user_1",
			organizationId: "org_1",
		});

		expect(isOwner).toBe(true);
	});

	it("returns false when owner membership does not exist", async () => {
		const db = createDbMock([]);
		const { isOrganizationOwner } = await loadAccessControlModule();

		const isOwner = await isOrganizationOwner(db, {
			userId: "user_1",
			organizationId: "org_1",
		});

		expect(isOwner).toBe(false);
	});

	it("returns true for admin-or-owner checks when membership exists", async () => {
		const db = createDbMock([{ id: "member_1" }]);
		const { isOrganizationAdminOrOwner } = await loadAccessControlModule();

		const hasAccess = await isOrganizationAdminOrOwner(db, {
			userId: "user_1",
			organizationId: "org_1",
		});

		expect(hasAccess).toBe(true);
	});
});
