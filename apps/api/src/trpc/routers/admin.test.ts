import { beforeEach, describe, expect, it, mock } from "bun:test";

const banUserMock = mock(async () => ({
	headers: new Headers({ "set-cookie": "session=ban" }),
	response: {},
}));
const unbanUserMock = mock(async () => ({
	headers: new Headers({ "set-cookie": "session=unban" }),
	response: {},
}));
const revokeUserSessionsMock = mock(async () => ({
	headers: new Headers(),
	response: {},
}));
const impersonateUserMock = mock(async () => ({
	headers: new Headers({ "set-cookie": "session=impersonate" }),
	response: {},
}));
const stopImpersonatingMock = mock(async () => ({
	headers: new Headers({ "set-cookie": "session=admin" }),
	response: {},
}));
const getCustomerByOrganizationIdMock = mock(
	async (_organizationId: string) =>
		({ id: "customer-existing" }) as {
			id: string;
		} | null
);
const getPolarCustomerStateMock = mock(async () => ({
	customerId: "customer-1",
}));
const partitionWebsiteSubscriptionsForDeletionMock = mock(() => ({
	freeToRevoke: [],
	blockingPaidOrUnknown: [],
}));
const polarCustomerCreateMock = mock(async () => ({ id: "customer-created" }));
const polarSubscriptionRevokeMock = mock(async () => ({}));
const permanentlyDeleteWebsiteMock = mock(async () => ({
	id: "site-1",
	slug: "cossistant",
}));
const deleteOrganizationFilesMock = mock(async () => 3);
const deleteWebsiteFilesMock = mock(async () => 2);
const invalidateApiKeyCacheForWebsiteMock = mock(async () => {});
const removeUserFromDefaultAudienceMock = mock(async () => true);
const grantAiCreditUsageMock = mock(async () => ({ status: "ingested" }));
const getAiCreditMeterStateMock = mock(async () => ({
	balance: 875,
	consumedUnits: 125,
	creditedUnits: 1000,
	lastSyncedAt: "2026-04-02T10:00:00.000Z",
	meterBacked: true,
	source: "live",
}));
const getPlanForWebsiteMock = mock(async () => ({
	planName: "pro",
	displayName: "Pro",
	price: 49,
	features: {
		"ai-credit": 1000,
	},
	hardLimitsEnforced: true,
	hardLimitsUnavailableReason: null,
	billing: {
		enabled: true,
		provider: "polar",
		canManageSubscription: true,
	},
}));
const isPolarEnabledMock = mock(() => true);

mock.module("@api/lib/auth", () => ({
	auth: {
		api: {
			banUser: banUserMock,
			unbanUser: unbanUserMock,
			revokeUserSessions: revokeUserSessionsMock,
			impersonateUser: impersonateUserMock,
			stopImpersonating: stopImpersonatingMock,
		},
	},
}));

mock.module("@api/lib/ai-credits/polar-meter", () => ({
	getAiCreditMeterState: getAiCreditMeterStateMock,
	grantAiCreditUsage: grantAiCreditUsageMock,
}));

mock.module("@api/lib/billing-mode", () => ({
	isPolarEnabled: isPolarEnabledMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/lib/plans/polar", () => ({
	getCustomerByOrganizationId: getCustomerByOrganizationIdMock,
	getCustomerState: getPolarCustomerStateMock,
	partitionWebsiteSubscriptionsForDeletion:
		partitionWebsiteSubscriptionsForDeletionMock,
}));

mock.module("@api/lib/polar", () => ({
	default: {
		customers: {
			create: polarCustomerCreateMock,
		},
		subscriptions: {
			revoke: polarSubscriptionRevokeMock,
		},
	},
}));

mock.module("@api/db/queries/website", () => ({
	permanentlyDeleteWebsite: permanentlyDeleteWebsiteMock,
}));

mock.module("@api/services/upload", () => ({
	deleteOrganizationFiles: deleteOrganizationFilesMock,
	deleteWebsiteFiles: deleteWebsiteFilesMock,
}));

mock.module("@api/utils/cache/api-key-cache", () => ({
	invalidateApiKeyCacheForWebsite: invalidateApiKeyCacheForWebsiteMock,
}));

mock.module("@cossistant/transactional", () => ({
	removeUserFromDefaultAudience: removeUserFromDefaultAudienceMock,
}));

const modulePromise = Promise.all([import("../init"), import("./admin")]);

function createThenableBuilder(result: unknown) {
	const builder = {
		from: () => builder,
		innerJoin: () => builder,
		where: () => builder,
		orderBy: () => builder,
		limit: () => Promise.resolve(result),
		offset: () => Promise.resolve(result),
		returning: () => Promise.resolve(result),
		// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are thenable, and these tests fake that contract.
		then: (
			resolve: (value: unknown) => unknown,
			reject: (reason: unknown) => unknown
		) => Promise.resolve(result).then(resolve, reject),
	};

	return builder;
}

function createDb(selectResults: unknown[], deleteResults: unknown[] = []) {
	let selectIndex = 0;
	let deleteIndex = 0;

	return {
		delete: mock(() => {
			const result = deleteResults[deleteIndex] ?? [];
			deleteIndex += 1;
			return createThenableBuilder(result);
		}),
		select: mock(() => {
			const result = selectResults[selectIndex] ?? [];
			selectIndex += 1;
			return createThenableBuilder(result);
		}),
	};
}

async function createCaller(
	options: {
		role?: string | null;
		db?: unknown;
		impersonatedBy?: string | null;
		appendResponseHeader?: (name: string, value: string) => void;
	} = {}
) {
	const [{ createCallerFactory }, { adminRouter }] = await modulePromise;
	const createCallerFactoryForRouter = createCallerFactory(adminRouter);

	return createCallerFactoryForRouter({
		db: (options.db ?? createDb([])) as never,
		user: {
			id: "admin-user",
			name: "Admin User",
			email: "admin@cossistant.com",
			role: options.role ?? "admin",
		} as never,
		session: {
			id: "session-1",
			impersonatedBy: options.impersonatedBy ?? null,
		} as never,
		geo: {} as never,
		headers: new Headers(),
		appendResponseHeader: options.appendResponseHeader,
	});
}

function createUser(overrides: Record<string, unknown> = {}) {
	return {
		id: "user-1",
		name: "User One",
		email: "user@example.com",
		emailVerified: true,
		image: null,
		isAnonymous: false,
		createdAt: new Date("2026-04-01T10:00:00.000Z"),
		updatedAt: new Date("2026-04-02T10:00:00.000Z"),
		lastSeenAt: null,
		role: "user",
		banned: false,
		banReason: null,
		banExpires: null,
		...overrides,
	};
}

function createWebsiteDeletionTarget(overrides: Record<string, unknown> = {}) {
	return {
		id: "site-1",
		name: "Cossistant",
		slug: "cossistant",
		domain: "cossistant.com",
		organizationId: "org-1",
		organizationName: "Cossistant Inc",
		organizationSlug: "cossistant-inc",
		teamId: "team-1",
		...overrides,
	};
}

describe("admin router", () => {
	beforeEach(() => {
		banUserMock.mockClear();
		unbanUserMock.mockClear();
		revokeUserSessionsMock.mockClear();
		impersonateUserMock.mockClear();
		stopImpersonatingMock.mockClear();
		getCustomerByOrganizationIdMock.mockClear();
		getCustomerByOrganizationIdMock.mockImplementation(
			async () => ({ id: "customer-existing" }) as { id: string } | null
		);
		getPolarCustomerStateMock.mockClear();
		getPolarCustomerStateMock.mockImplementation(async () => ({
			customerId: "customer-1",
		}));
		partitionWebsiteSubscriptionsForDeletionMock.mockClear();
		partitionWebsiteSubscriptionsForDeletionMock.mockImplementation(() => ({
			freeToRevoke: [],
			blockingPaidOrUnknown: [],
		}));
		polarCustomerCreateMock.mockClear();
		polarSubscriptionRevokeMock.mockClear();
		permanentlyDeleteWebsiteMock.mockClear();
		permanentlyDeleteWebsiteMock.mockImplementation(async () => ({
			id: "site-1",
			slug: "cossistant",
		}));
		deleteOrganizationFilesMock.mockClear();
		deleteOrganizationFilesMock.mockImplementation(async () => 3);
		deleteWebsiteFilesMock.mockClear();
		deleteWebsiteFilesMock.mockImplementation(async () => 2);
		invalidateApiKeyCacheForWebsiteMock.mockClear();
		invalidateApiKeyCacheForWebsiteMock.mockImplementation(async () => {});
		removeUserFromDefaultAudienceMock.mockClear();
		removeUserFromDefaultAudienceMock.mockImplementation(async () => true);
		grantAiCreditUsageMock.mockClear();
		grantAiCreditUsageMock.mockImplementation(async () => ({
			status: "ingested",
		}));
		getAiCreditMeterStateMock.mockClear();
		getAiCreditMeterStateMock.mockImplementation(async () => ({
			balance: 875,
			consumedUnits: 125,
			creditedUnits: 1000,
			lastSyncedAt: "2026-04-02T10:00:00.000Z",
			meterBacked: true,
			source: "live",
		}));
		getPlanForWebsiteMock.mockClear();
		getPlanForWebsiteMock.mockImplementation(async () => ({
			planName: "pro",
			displayName: "Pro",
			price: 49,
			features: {
				"ai-credit": 1000,
			},
			hardLimitsEnforced: true,
			hardLimitsUnavailableReason: null,
			billing: {
				enabled: true,
				provider: "polar",
				canManageSubscription: true,
			},
		}));
		isPolarEnabledMock.mockClear();
		isPolarEnabledMock.mockImplementation(() => true);
	});

	it("rejects non-admin users before admin operations run", async () => {
		const caller = await createCaller({ role: "user" });

		await expect(caller.listUsers({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(caller.banUser({ userId: "user-1" })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(caller.unbanUser({ userId: "user-1" })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.revokeUserSessions({ userId: "user-1" })
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.impersonateUser({ userId: "user-1" })
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(caller.listWebsites({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.getWebsiteDeletionPreview({ websiteId: "site-1" })
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.deleteWebsiteForever({
				websiteId: "site-1",
				confirmationSlug: "cossistant",
				deleteOrganization: false,
			})
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.getWebsiteAiUsage({ websiteId: "site-1" })
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.grantWebsiteAiUsage({ websiteId: "site-1", amount: 10 })
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	it("returns the latest 40 serialized users", async () => {
		const db = createDb([
			[
				createUser({
					id: "user-2",
					email: "latest@example.com",
					createdAt: new Date("2026-04-02T10:00:00.000Z"),
					banned: true,
					banReason: "Spam",
				}),
				createUser(),
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.listUsers({});

		expect(result.limit).toBe(40);
		expect(result.users).toEqual([
			{
				id: "user-2",
				name: "User One",
				email: "latest@example.com",
				image: null,
				role: "user",
				banned: true,
				banReason: "Spam",
				banExpires: null,
				createdAt: "2026-04-02T10:00:00.000Z",
				updatedAt: "2026-04-02T10:00:00.000Z",
				lastSeenAt: null,
			},
			{
				id: "user-1",
				name: "User One",
				email: "user@example.com",
				image: null,
				role: "user",
				banned: false,
				banReason: null,
				banExpires: null,
				createdAt: "2026-04-01T10:00:00.000Z",
				updatedAt: "2026-04-02T10:00:00.000Z",
				lastSeenAt: null,
			},
		]);
	});

	it("groups a user's active websites by organization", async () => {
		const db = createDb([
			[createUser()],
			[
				{
					organizationId: "org-1",
					organizationName: "Acme",
					organizationSlug: "acme",
					role: "admin",
					joinedAt: new Date("2026-04-01T10:00:00.000Z"),
				},
			],
			[{ teamId: "team-2", organizationId: "org-2" }],
			[{ id: "org-2", name: "Beta", slug: "beta" }],
			[
				{
					id: "site-1",
					name: "Acme Site",
					slug: "acme-site",
					domain: "acme.com",
					logoUrl: null,
					organizationId: "org-1",
					teamId: "team-1",
					createdAt: "2026-04-02T10:00:00.000Z",
				},
				{
					id: "site-2",
					name: "Beta Site",
					slug: "beta-site",
					domain: "beta.com",
					logoUrl: null,
					organizationId: "org-2",
					teamId: "team-2",
					createdAt: "2026-04-02T10:00:00.000Z",
				},
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.getUserWebsites({ userId: "user-1" });

		expect(result.organizations).toEqual([
			{
				id: "org-1",
				name: "Acme",
				slug: "acme",
				role: "admin",
				joinedAt: "2026-04-01T10:00:00.000Z",
				websites: [
					{
						id: "site-1",
						name: "Acme Site",
						slug: "acme-site",
						domain: "acme.com",
						logoUrl: null,
						accessSource: "organization",
						createdAt: "2026-04-02T10:00:00.000Z",
					},
				],
			},
			{
				id: "org-2",
				name: "Beta",
				slug: "beta",
				role: null,
				joinedAt: null,
				websites: [
					{
						id: "site-2",
						name: "Beta Site",
						slug: "beta-site",
						domain: "beta.com",
						logoUrl: null,
						accessSource: "team",
						createdAt: "2026-04-02T10:00:00.000Z",
					},
				],
			},
		]);
		expect(result.user.email).toBe("user@example.com");
	});

	it("returns the latest 40 serialized websites", async () => {
		const db = createDb([
			[
				{
					id: "site-1",
					name: "Cossistant",
					slug: "cossistant",
					domain: "cossistant.com",
					logoUrl: null,
					status: "active",
					organizationId: "org-1",
					organizationName: "Cossistant Inc",
					organizationSlug: "cossistant-inc",
					teamId: "team-1",
					createdAt: "2026-04-02T10:00:00.000Z",
					updatedAt: "2026-04-03T10:00:00.000Z",
				},
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.listWebsites({ search: "cossistant" });

		expect(result.limit).toBe(40);
		expect(result.websites).toEqual([
			{
				id: "site-1",
				name: "Cossistant",
				slug: "cossistant",
				domain: "cossistant.com",
				logoUrl: null,
				status: "active",
				organizationId: "org-1",
				organizationName: "Cossistant Inc",
				organizationSlug: "cossistant-inc",
				teamId: "team-1",
				createdAt: "2026-04-02T10:00:00.000Z",
				updatedAt: "2026-04-03T10:00:00.000Z",
			},
		]);
	});

	it("returns a website deletion preview for admins", async () => {
		const db = createDb([
			[createWebsiteDeletionTarget()],
			[{ value: 1 }],
			[
				{ email: "owner@example.com", userId: "user-owner" },
				{ email: "owner@example.com", userId: "user-owner-duplicate" },
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.getWebsiteDeletionPreview({
			websiteId: "site-1",
		});

		expect(result).toEqual({
			website: {
				id: "site-1",
				name: "Cossistant",
				slug: "cossistant",
				domain: "cossistant.com",
			},
			organization: {
				id: "org-1",
				name: "Cossistant Inc",
				slug: "cossistant-inc",
				activeWebsiteCount: 1,
				memberEmailCount: 1,
			},
		});
	});

	it("rejects website deletion when the confirmation slug does not match", async () => {
		const db = createDb([[createWebsiteDeletionTarget()]]);
		const caller = await createCaller({ db });

		await expect(
			caller.deleteWebsiteForever({
				websiteId: "site-1",
				confirmationSlug: "wrong-slug",
				deleteOrganization: false,
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(removeUserFromDefaultAudienceMock).not.toHaveBeenCalled();
		expect(permanentlyDeleteWebsiteMock).not.toHaveBeenCalled();
	});

	it("deletes a website forever and removes organization members from Resend", async () => {
		const db = createDb([
			[createWebsiteDeletionTarget()],
			[{ value: 1 }],
			[
				{ email: "owner@example.com", userId: "user-owner" },
				{ email: "member@example.com", userId: "user-member" },
				{ email: "owner@example.com", userId: "user-owner-duplicate" },
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.deleteWebsiteForever({
			websiteId: "site-1",
			confirmationSlug: "cossistant",
			deleteOrganization: false,
		});

		expect(result).toEqual({
			success: true,
			websiteId: "site-1",
			websiteSlug: "cossistant",
			organizationId: "org-1",
			organizationDeleted: false,
			removedResendEmailCount: 2,
			deletedStorageObjectCount: 2,
		});
		expect(getCustomerByOrganizationIdMock).toHaveBeenCalledWith("org-1");
		expect(getPolarCustomerStateMock).toHaveBeenCalledWith("customer-existing");
		expect(partitionWebsiteSubscriptionsForDeletionMock).toHaveBeenCalledWith(
			{ customerId: "customer-1" },
			"site-1"
		);
		expect(invalidateApiKeyCacheForWebsiteMock).toHaveBeenCalledWith(
			db,
			"site-1"
		);
		expect(removeUserFromDefaultAudienceMock).toHaveBeenCalledTimes(2);
		expect(removeUserFromDefaultAudienceMock).toHaveBeenCalledWith(
			"owner@example.com"
		);
		expect(removeUserFromDefaultAudienceMock).toHaveBeenCalledWith(
			"member@example.com"
		);
		expect(deleteWebsiteFilesMock).toHaveBeenCalledWith({
			organizationId: "org-1",
			websiteId: "site-1",
		});
		expect(deleteOrganizationFilesMock).not.toHaveBeenCalled();
		expect(permanentlyDeleteWebsiteMock).toHaveBeenCalledWith(db, {
			orgId: "org-1",
			websiteId: "site-1",
		});
	});

	it("blocks organization deletion when the organization has other active websites", async () => {
		const db = createDb([
			[createWebsiteDeletionTarget()],
			[{ value: 2 }],
			[{ email: "owner@example.com", userId: "user-owner" }],
		]);
		const caller = await createCaller({ db });

		await expect(
			caller.deleteWebsiteForever({
				websiteId: "site-1",
				confirmationSlug: "cossistant",
				deleteOrganization: true,
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(removeUserFromDefaultAudienceMock).not.toHaveBeenCalled();
		expect(deleteOrganizationFilesMock).not.toHaveBeenCalled();
		expect(db.delete).not.toHaveBeenCalled();
	});

	it("deletes the organization when it is the last active website", async () => {
		const db = createDb(
			[
				[createWebsiteDeletionTarget()],
				[{ value: 1 }],
				[{ email: "owner@example.com", userId: "user-owner" }],
			],
			[[{ id: "org-1", slug: "cossistant-inc" }]]
		);
		const caller = await createCaller({ db });

		const result = await caller.deleteWebsiteForever({
			websiteId: "site-1",
			confirmationSlug: "cossistant",
			deleteOrganization: true,
		});

		expect(result).toEqual({
			success: true,
			websiteId: "site-1",
			websiteSlug: "cossistant",
			organizationId: "org-1",
			organizationDeleted: true,
			removedResendEmailCount: 1,
			deletedStorageObjectCount: 3,
		});
		expect(deleteOrganizationFilesMock).toHaveBeenCalledWith("org-1");
		expect(deleteWebsiteFilesMock).not.toHaveBeenCalled();
		expect(permanentlyDeleteWebsiteMock).not.toHaveBeenCalled();
		expect(db.delete).toHaveBeenCalledTimes(1);
	});

	it("prevents database deletion when Resend cleanup fails", async () => {
		removeUserFromDefaultAudienceMock.mockImplementation(async () => false);
		const db = createDb([
			[createWebsiteDeletionTarget()],
			[{ value: 1 }],
			[{ email: "owner@example.com", userId: "user-owner" }],
		]);
		const caller = await createCaller({ db });

		await expect(
			caller.deleteWebsiteForever({
				websiteId: "site-1",
				confirmationSlug: "cossistant",
				deleteOrganization: false,
			})
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
		});
		expect(deleteWebsiteFilesMock).not.toHaveBeenCalled();
		expect(permanentlyDeleteWebsiteMock).not.toHaveBeenCalled();
		expect(db.delete).not.toHaveBeenCalled();
	});

	it("returns a website AI usage snapshot for admins", async () => {
		const site = {
			id: "site-1",
			name: "Cossistant",
			slug: "cossistant",
			domain: "cossistant.com",
			logoUrl: null,
			status: "active",
			organizationId: "org-1",
			teamId: "team-1",
			createdAt: new Date("2026-04-01T10:00:00.000Z"),
			updatedAt: new Date("2026-04-02T10:00:00.000Z"),
			deletedAt: null,
		};
		const db = createDb([[site]]);
		const caller = await createCaller({ db });

		const result = await caller.getWebsiteAiUsage({ websiteId: "site-1" });

		expect(result).toEqual({
			website: {
				id: "site-1",
				name: "Cossistant",
				slug: "cossistant",
				organizationId: "org-1",
			},
			plan: {
				name: "pro",
				displayName: "Pro",
				includedAiCredits: 1000,
			},
			billing: {
				enabled: true,
				provider: "polar",
				canManageSubscription: true,
			},
			aiCredits: {
				balance: 875,
				consumedUnits: 125,
				creditedUnits: 1000,
				meterBacked: true,
				source: "live",
				lastSyncedAt: "2026-04-02T10:00:00.000Z",
			},
		});
		expect(getPlanForWebsiteMock).toHaveBeenCalledWith(site);
		expect(getAiCreditMeterStateMock).toHaveBeenCalledWith("org-1");
	});

	it("grants website AI usage against the organization Polar customer", async () => {
		const db = createDb([
			[
				{
					id: "site-1",
					name: "Cossistant",
					slug: "cossistant",
					organizationId: "org-1",
					organizationName: "Cossistant Inc",
				},
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.grantWebsiteAiUsage({
			websiteId: "site-1",
			amount: 12.3456,
		});

		expect(result).toEqual({
			success: true,
			amount: 12.346,
			websiteId: "site-1",
			websiteSlug: "cossistant",
			organizationId: "org-1",
			customerId: "customer-existing",
			customerCreated: false,
		});
		expect(getCustomerByOrganizationIdMock).toHaveBeenCalledWith("org-1");
		expect(polarCustomerCreateMock).not.toHaveBeenCalled();
		expect(grantAiCreditUsageMock).toHaveBeenCalledWith({
			organizationId: "org-1",
			websiteId: "site-1",
			amount: 12.346,
			adminUserId: "admin-user",
		});
	});

	it("creates a missing Polar customer before granting website AI usage", async () => {
		getCustomerByOrganizationIdMock.mockImplementation(async () => null);
		const db = createDb([
			[
				{
					id: "site-1",
					name: "Cossistant",
					slug: "cossistant",
					organizationId: "org-1",
					organizationName: "Cossistant Inc",
				},
			],
			[
				{
					email: "owner@example.com",
					name: "Owner User",
					role: "owner",
					createdAt: new Date("2026-04-01T10:00:00.000Z"),
				},
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.grantWebsiteAiUsage({
			websiteId: "site-1",
			amount: 10,
		});

		expect(result.customerCreated).toBe(true);
		expect(result.customerId).toBe("customer-created");
		expect(polarCustomerCreateMock).toHaveBeenCalledWith({
			email: "owner@example.com",
			externalId: "org-1",
			name: "Cossistant Inc",
		});
		expect(grantAiCreditUsageMock).toHaveBeenCalledTimes(1);
	});

	it("fails website AI grants safely when billing or data is invalid", async () => {
		const caller = await createCaller();

		await expect(
			caller.grantWebsiteAiUsage({ websiteId: "site-1", amount: -1 })
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		isPolarEnabledMock.mockImplementation(() => false);
		await expect(
			caller.grantWebsiteAiUsage({ websiteId: "site-1", amount: 1 })
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		isPolarEnabledMock.mockImplementation(() => true);
		const missingWebsiteCaller = await createCaller({ db: createDb([[]]) });
		await expect(
			missingWebsiteCaller.grantWebsiteAiUsage({
				websiteId: "missing-site",
				amount: 1,
			})
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});

		getCustomerByOrganizationIdMock.mockImplementation(async () => null);
		const missingEmailCaller = await createCaller({
			db: createDb([
				[
					{
						id: "site-1",
						name: "Cossistant",
						slug: "cossistant",
						organizationId: "org-1",
						organizationName: "Cossistant Inc",
					},
				],
				[],
			]),
		});
		await expect(
			missingEmailCaller.grantWebsiteAiUsage({
				websiteId: "site-1",
				amount: 1,
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("delegates safe admin actions through Better Auth and appends cookies", async () => {
		const cookies: string[] = [];
		const caller = await createCaller({
			appendResponseHeader: (name, value) => {
				if (name.toLowerCase() === "set-cookie") {
					cookies.push(value);
				}
			},
		});

		await caller.banUser({ userId: "user-1" });
		await caller.unbanUser({ userId: "user-1" });
		await caller.revokeUserSessions({ userId: "user-1" });
		await caller.impersonateUser({ userId: "user-1" });

		expect(banUserMock).toHaveBeenCalledTimes(1);
		expect(unbanUserMock).toHaveBeenCalledTimes(1);
		expect(revokeUserSessionsMock).toHaveBeenCalledTimes(1);
		expect(impersonateUserMock).toHaveBeenCalledTimes(1);
		expect(cookies).toEqual([
			"session=ban",
			"session=unban",
			"session=impersonate",
		]);
	});

	it("allows stopping impersonation only from an impersonated session", async () => {
		const regularCaller = await createCaller({ role: "user" });

		await expect(regularCaller.stopImpersonating()).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		const impersonatedCaller = await createCaller({
			role: "user",
			impersonatedBy: "admin-user",
		});

		await impersonatedCaller.stopImpersonating();

		expect(stopImpersonatingMock).toHaveBeenCalledTimes(1);
	});

	it("does not expose dangerous Better Auth defaults", async () => {
		const caller = await createCaller();

		expect("removeUser" in caller).toBe(false);
		expect("setRole" in caller).toBe(false);
		expect("setUserPassword" in caller).toBe(false);
		expect("createUser" in caller).toBe(false);
	});
});
