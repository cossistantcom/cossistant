import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";
import { APIKeyType, WebsiteInstallationTarget } from "@cossistant/types";

const createDefaultWebsiteKeysMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown[]>);
const createApiKeyMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const getApiKeyByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getApiKeysByOrganizationMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown[]>);
const revokeApiKeyMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const createDefaultWebsiteViewsMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown[]>);
const createWebsiteMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const getWebsiteBySlugWithAccessMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const permanentlyDeleteWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const updateWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const ensureFreeSubscriptionForWebsiteMock = mock((async () => ({
	status: "already_exists",
	subscriptionId: null,
	revokedSubscriptionIds: [],
})) as (...args: unknown[]) => Promise<unknown>);
const getCustomerByOrganizationIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getCustomerStateMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const partitionWebsiteSubscriptionsForDeletionMock = mock((() => ({
	subscriptionsToKeep: [],
	subscriptionsToRevoke: [],
})) as (...args: unknown[]) => unknown);

class WebsiteSlugConflictError extends Error {
	constructor() {
		super("Website slug already exists");
		this.name = "WebsiteSlugConflictError";
	}
}

class PolarCustomerInvariantViolationError extends Error {
	constructor() {
		super("Missing customer");
		this.name = "PolarCustomerInvariantViolationError";
	}
}

mock.module("@api/db/queries/api-keys", () => ({
	createApiKey: createApiKeyMock,
	createDefaultWebsiteKeys: createDefaultWebsiteKeysMock,
	getApiKeyById: getApiKeyByIdMock,
	getApiKeysByOrganization: getApiKeysByOrganizationMock,
	revokeApiKey: revokeApiKeyMock,
}));

mock.module("@api/db/queries/view", () => ({
	createDefaultWebsiteViews: createDefaultWebsiteViewsMock,
}));

mock.module("@api/db/queries/website", () => ({
	createWebsite: createWebsiteMock,
	getWebsiteBySlugWithAccess: getWebsiteBySlugWithAccessMock,
	permanentlyDeleteWebsite: permanentlyDeleteWebsiteMock,
	updateWebsite: updateWebsiteMock,
	WebsiteSlugConflictError,
}));

mock.module("@api/lib/plans/polar", () => ({
	ensureFreeSubscriptionForWebsite: ensureFreeSubscriptionForWebsiteMock,
	getCustomerByOrganizationId: getCustomerByOrganizationIdMock,
	getCustomerState: getCustomerStateMock,
	partitionWebsiteSubscriptionsForDeletion:
		partitionWebsiteSubscriptionsForDeletionMock,
	PolarCustomerInvariantViolationError,
}));

mock.module("@api/lib/polar", () => ({
	default: {},
}));

mock.module("@api/env", () => ({
	env: {
		TINYBIRD_HOST: "http://localhost:7181",
	},
}));

const modulePromise = Promise.all([import("../init"), import("./website")]);

const ORGANIZATION_ID = "01ARYZ6S41TSV4RRFFQ69G5FAV";
const USER_ID = "01ARYZ6S41TSV4RRFFQ69G5FAW";
const WEBSITE_ID = "01ARYZ6S41TSV4RRFFQ69G5FAX";

const consoleErrorMock = mock(() => {});
const originalConsoleError = console.error;

function createInput() {
	return {
		name: "Better-i18n",
		domain: "better-i18n.com",
		organizationId: ORGANIZATION_ID,
		installationTarget: WebsiteInstallationTarget.REACT,
	} as const;
}

function createDb(findFirstMock: (...args: unknown[]) => Promise<unknown>) {
	return {
		query: {
			website: {
				findFirst: findFirstMock,
			},
		},
	} as unknown as Database;
}

function createWebsiteRecord(slug = "better-i18n") {
	return {
		id: WEBSITE_ID,
		name: "Better-i18n",
		slug,
		domain: "better-i18n.com",
		whitelistedDomains: ["https://better-i18n.com", "http://localhost:3000"],
		organizationId: ORGANIZATION_ID,
	} as const;
}

function createApiKeyRecord() {
	return {
		id: "01ARYZ6S41TSV4RRFFQ69G5FAZ",
		name: "Test public key",
		key: "pk_test_123",
		keyType: APIKeyType.PUBLIC,
		isTest: true,
		isActive: true,
		createdAt: "2024-01-01T00:00:00.000Z",
		lastUsedAt: null,
		revokedAt: null,
	} as const;
}

async function createCaller(db: Database) {
	const [{ createCallerFactory }, { websiteRouter }] = await modulePromise;
	const createCallerFactoryForRouter = createCallerFactory(websiteRouter);

	return createCallerFactoryForRouter({
		db,
		user: {
			id: USER_ID,
			name: "Anthony",
			email: "anthony@better-i18n.com",
		} as never,
		session: { id: "session_1" } as never,
		geo: {} as never,
		headers: new Headers(),
	});
}

describe("website router create", () => {
	beforeEach(() => {
		console.error = consoleErrorMock as typeof console.error;
		consoleErrorMock.mockReset();

		createDefaultWebsiteKeysMock.mockReset();
		createApiKeyMock.mockReset();
		getApiKeyByIdMock.mockReset();
		getApiKeysByOrganizationMock.mockReset();
		revokeApiKeyMock.mockReset();
		createDefaultWebsiteViewsMock.mockReset();
		createWebsiteMock.mockReset();
		getWebsiteBySlugWithAccessMock.mockReset();
		permanentlyDeleteWebsiteMock.mockReset();
		updateWebsiteMock.mockReset();
		ensureFreeSubscriptionForWebsiteMock.mockReset();
		getCustomerByOrganizationIdMock.mockReset();
		getCustomerStateMock.mockReset();
		partitionWebsiteSubscriptionsForDeletionMock.mockReset();

		createDefaultWebsiteKeysMock.mockResolvedValue([createApiKeyRecord()]);
		createDefaultWebsiteViewsMock.mockResolvedValue([]);
		createWebsiteMock.mockImplementation(async (_db, params) =>
			createWebsiteRecord((params as { data: { slug: string } }).data.slug)
		);
		ensureFreeSubscriptionForWebsiteMock.mockResolvedValue({
			status: "already_exists",
			subscriptionId: null,
			revokedSubscriptionIds: [],
		});
		partitionWebsiteSubscriptionsForDeletionMock.mockReturnValue({
			subscriptionsToKeep: [],
			subscriptionsToRevoke: [],
		});
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	it("creates a website successfully with the base slug when available", async () => {
		const findFirstMock = mock(
			(async () => null) as (...args: unknown[]) => Promise<unknown>
		);
		const caller = await createCaller(createDb(findFirstMock));

		const response = await caller.create(createInput());

		expect(response.slug).toBe("better-i18n");
		expect(createWebsiteMock).toHaveBeenCalledTimes(1);
		expect(
			(
				createWebsiteMock.mock.calls[0]?.[1] as {
					data: { slug: string };
				}
			).data.slug
		).toBe("better-i18n");
	});

	it("resolves slug collisions before insert without returning a 500", async () => {
		const findFirstMock = mock(
			(async () => null) as (...args: unknown[]) => Promise<unknown>
		);
		findFirstMock.mockResolvedValueOnce(null);
		findFirstMock.mockResolvedValueOnce({ id: "01ARYZ6S41TSV4RRFFQ69G5FB0" });
		findFirstMock.mockResolvedValueOnce(null);

		const caller = await createCaller(createDb(findFirstMock));
		const response = await caller.create(createInput());
		const insertedSlug = (
			createWebsiteMock.mock.calls[0]?.[1] as {
				data: { slug: string };
			}
		).data.slug;

		expect(response.slug).toStartWith("better-i18n-");
		expect(response.slug).not.toBe("better-i18n");
		expect(insertedSlug).toBe(response.slug);
		expect(createWebsiteMock).toHaveBeenCalledTimes(1);
	});

	it("returns a safe bad request when a slug conflict still happens at insert time", async () => {
		const findFirstMock = mock(
			(async () => null) as (...args: unknown[]) => Promise<unknown>
		);
		findFirstMock.mockResolvedValueOnce(null);
		findFirstMock.mockResolvedValueOnce(null);
		createWebsiteMock.mockRejectedValueOnce(new WebsiteSlugConflictError());

		const caller = await createCaller(createDb(findFirstMock));

		await expect(caller.create(createInput())).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "A conflicting website slug already exists. Please try again.",
		});
	});

	it("sanitizes unexpected insert failures before they reach the client", async () => {
		const findFirstMock = mock(
			(async () => null) as (...args: unknown[]) => Promise<unknown>
		);
		findFirstMock.mockResolvedValueOnce(null);
		findFirstMock.mockResolvedValueOnce(null);
		createWebsiteMock.mockRejectedValueOnce(
			new Error(
				'Failed query: insert into "website" ("organization_id") values ($1)'
			)
		);

		const caller = await createCaller(createDb(findFirstMock));

		try {
			await caller.create(createInput());
			throw new Error("Expected create to throw");
		} catch (error) {
			expect(error).toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to create website",
			});
			expect((error as Error).message).not.toContain('insert into "website"');
			expect((error as Error).message).not.toContain("organization_id");
		}
	});
});
