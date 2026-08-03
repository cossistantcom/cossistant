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
const findVerifiedWebsiteByDomainMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getActiveWebsiteBySlugMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getWebsiteApiKeyScopeMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getWebsiteByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getWebsiteBySlugWithAccessMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const listWebsiteListItemsForOrganizationMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown[]>);
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
const getPlanFromCustomerStateMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getSubscriptionForWebsiteMock = mock(
	(() => null) as (...args: unknown[]) => unknown
);
const getUnscopedPaidSubscriptionsMock = mock((() => []) as (
	...args: unknown[]
) => unknown[]);
const partitionWebsiteSubscriptionsForDeletionMock = mock((() => ({
	subscriptionsToKeep: [],
	subscriptionsToRevoke: [],
})) as (...args: unknown[]) => unknown);
const generateTinybirdJWTMock = mock(
	(async () => "tinybird-token") as (
		...args: unknown[]
	) => Promise<string | null>
);
const getConversationSentimentSatisfactionAggregateMock = mock((async () => ({
	average: null,
	count: 0,
})) as (...args: unknown[]) => Promise<unknown>);
const getWebsiteFeedbackSatisfactionAggregateMock = mock((async () => ({
	average: null,
	count: 0,
})) as (...args: unknown[]) => Promise<unknown>);

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

mock.module("@api/db/queries/conversation", () => ({
	getConversationSentimentSatisfactionAggregate:
		getConversationSentimentSatisfactionAggregateMock,
}));

mock.module("@api/db/queries/feedback", () => ({
	getWebsiteFeedbackSatisfactionAggregate:
		getWebsiteFeedbackSatisfactionAggregateMock,
}));

mock.module("@api/db/queries/website", () => ({
	createWebsite: createWebsiteMock,
	findVerifiedWebsiteByDomain: findVerifiedWebsiteByDomainMock,
	getActiveWebsiteBySlug: getActiveWebsiteBySlugMock,
	getWebsiteApiKeyScope: getWebsiteApiKeyScopeMock,
	getWebsiteById: getWebsiteByIdMock,
	getWebsiteBySlugWithAccess: getWebsiteBySlugWithAccessMock,
	listWebsiteListItemsForOrganization: listWebsiteListItemsForOrganizationMock,
	permanentlyDeleteWebsite: permanentlyDeleteWebsiteMock,
	updateWebsite: updateWebsiteMock,
	WebsiteSlugConflictError,
}));

mock.module("@api/lib/plans/polar", () => ({
	ensureFreeSubscriptionForWebsite: ensureFreeSubscriptionForWebsiteMock,
	getCustomerByOrganizationId: getCustomerByOrganizationIdMock,
	getCustomerState: getCustomerStateMock,
	getPlanFromCustomerState: getPlanFromCustomerStateMock,
	getSubscriptionForWebsite: getSubscriptionForWebsiteMock,
	getUnscopedPaidSubscriptions: getUnscopedPaidSubscriptionsMock,
	partitionWebsiteSubscriptionsForDeletion:
		partitionWebsiteSubscriptionsForDeletionMock,
	PolarCustomerInvariantViolationError,
}));

mock.module("@api/lib/polar", () => ({
	default: {},
}));

const mockEnv = {
	POLAR_ENABLED: true,
	TINYBIRD_ENABLED: true,
	TINYBIRD_HOST: "http://localhost:7181",
};

mock.module("@api/env", () => ({
	env: mockEnv,
}));

mock.module("@api/lib/tinybird-jwt", () => ({
	generateTinybirdJWT: generateTinybirdJWTMock,
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
		findVerifiedWebsiteByDomainMock.mockReset();
		getActiveWebsiteBySlugMock.mockReset();
		getWebsiteApiKeyScopeMock.mockReset();
		getWebsiteByIdMock.mockReset();
		getWebsiteBySlugWithAccessMock.mockReset();
		listWebsiteListItemsForOrganizationMock.mockReset();
		permanentlyDeleteWebsiteMock.mockReset();
		updateWebsiteMock.mockReset();
		ensureFreeSubscriptionForWebsiteMock.mockReset();
		getCustomerByOrganizationIdMock.mockReset();
		getCustomerStateMock.mockReset();
		getPlanFromCustomerStateMock.mockReset();
		getSubscriptionForWebsiteMock.mockReset();
		partitionWebsiteSubscriptionsForDeletionMock.mockReset();
		generateTinybirdJWTMock.mockReset();
		getConversationSentimentSatisfactionAggregateMock.mockReset();
		getWebsiteFeedbackSatisfactionAggregateMock.mockReset();

		createDefaultWebsiteKeysMock.mockResolvedValue([createApiKeyRecord()]);
		createDefaultWebsiteViewsMock.mockResolvedValue([]);
		findVerifiedWebsiteByDomainMock.mockResolvedValue(null);
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
		generateTinybirdJWTMock.mockResolvedValue("tinybird-token");
		mockEnv.TINYBIRD_ENABLED = true;
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

describe("website router getTinybirdToken", () => {
	beforeEach(() => {
		getWebsiteBySlugWithAccessMock.mockReset();
		generateTinybirdJWTMock.mockReset();
		mockEnv.TINYBIRD_ENABLED = true;

		getWebsiteBySlugWithAccessMock.mockResolvedValue({
			id: WEBSITE_ID,
			slug: "better-i18n",
			name: "Better-i18n",
			domain: "better-i18n.com",
			organizationId: ORGANIZATION_ID,
		});
		generateTinybirdJWTMock.mockResolvedValue("tinybird-token");
	});

	it("returns an enabled Tinybird token payload when Tinybird is enabled", async () => {
		const caller = await createCaller({} as Database);
		const response = await caller.getTinybirdToken({
			websiteSlug: "better-i18n",
		});

		expect(response).toMatchObject({
			enabled: true,
			token: "tinybird-token",
			host: "http://localhost:7181",
			maxRetentionDays: 90,
		});
		expect(typeof response.expiresAt).toBe("number");
		expect(generateTinybirdJWTMock).toHaveBeenCalledWith(WEBSITE_ID);
	});

	it("returns the disabled payload without minting a JWT when Tinybird is off", async () => {
		mockEnv.TINYBIRD_ENABLED = false;
		const caller = await createCaller({} as Database);
		const response = await caller.getTinybirdToken({
			websiteSlug: "better-i18n",
		});

		expect(response).toEqual({
			enabled: false,
			token: null,
			host: null,
			expiresAt: null,
			maxRetentionDays: null,
		});
		expect(generateTinybirdJWTMock).not.toHaveBeenCalled();
	});
});
