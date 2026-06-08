import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { WebsiteSelect } from "@api/db/schema";

const getWebsiteByIdWithAccessMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/db/queries/website", () => ({
	getWebsiteByIdWithAccess: getWebsiteByIdWithAccessMock,
}));

function createWebsite(overrides: Partial<WebsiteSelect> = {}): WebsiteSelect {
	return {
		id: "site-1",
		name: "Acme Support",
		slug: "acme",
		domain: "acme.test",
		defaultLanguage: "en",
		autoTranslateEnabled: true,
		contactEmail: null,
		isDomainOwnershipVerified: false,
		description: null,
		logoUrl: null,
		whitelistedDomains: [],
		defaultParticipantIds: [],
		installationTarget: "nextjs",
		organizationId: "org-1",
		teamId: "team-1",
		status: "active",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		deletedAt: null,
		...overrides,
	} as WebsiteSelect;
}

function createListDb(rows: unknown[]) {
	const chain = {
		select: mock(() => chain),
		from: mock(() => chain),
		innerJoin: mock(() => chain),
		leftJoin: mock(() => chain),
		where: mock(() => chain),
		orderBy: mock(() => chain),
		limit: mock(async () => rows),
	};

	return chain;
}

const modulePromise = import("./website-scope");

describe("resolveSupportWebsiteScope", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		getWebsiteByIdWithAccessMock.mockReset();
	});

	it("resolves an accessible website by id", async () => {
		const site = createWebsite();
		getWebsiteByIdWithAccessMock.mockResolvedValue(site);

		const { resolveSupportWebsiteScope } = await modulePromise;
		await expect(
			resolveSupportWebsiteScope({} as never, {
				userId: "user-1",
				websiteId: "site-1",
			})
		).resolves.toEqual(site);

		expect(getWebsiteByIdWithAccessMock).toHaveBeenCalledWith(
			{},
			{ userId: "user-1", websiteId: "site-1" }
		);
	});

	it("rejects inaccessible websites by id", async () => {
		getWebsiteByIdWithAccessMock.mockResolvedValue(null);

		const { resolveSupportWebsiteScope } = await modulePromise;
		await expect(
			resolveSupportWebsiteScope({} as never, {
				userId: "user-1",
				websiteId: "site-1",
			})
		).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
	});

	it("resolves by exact case-insensitive website name", async () => {
		const site = createWebsite();
		const db = createListDb([site]);
		getWebsiteByIdWithAccessMock.mockResolvedValue(site);

		const { resolveSupportWebsiteScope } = await modulePromise;
		await expect(
			resolveSupportWebsiteScope(db as never, {
				userId: "user-1",
				websiteName: "acme support",
			})
		).resolves.toEqual(site);
	});

	it("rejects missing website names", async () => {
		const db = createListDb([]);

		const { resolveSupportWebsiteScope } = await modulePromise;
		await expect(
			resolveSupportWebsiteScope(db as never, {
				userId: "user-1",
				websiteName: "No Match",
			})
		).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
	});

	it("rejects ambiguous website names", async () => {
		const db = createListDb([
			createWebsite({ id: "site-1" }),
			createWebsite({ id: "site-2", slug: "acme-eu" }),
		]);

		const { resolveSupportWebsiteScope } = await modulePromise;
		await expect(
			resolveSupportWebsiteScope(db as never, {
				userId: "user-1",
				websiteName: "Acme Support",
			})
		).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
	});

	it("requires exactly one selector", async () => {
		const { resolveSupportWebsiteScope } = await modulePromise;
		await expect(
			resolveSupportWebsiteScope({} as never, {
				userId: "user-1",
				websiteId: "site-1",
				websiteName: "Acme Support",
			})
		).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST" });
	});
});
