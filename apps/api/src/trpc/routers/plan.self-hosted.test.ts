import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";

const getWebsiteBySlugWithAccessMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
// getPlansForOrganization reads the organization's websites through this query
// rather than selecting from ctx.db directly.
const listOrganizationWebsitePlanTargetsMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown[]>);
const getRollingWindowMessageCountMock = mock(
	(async () => 0) as (...args: unknown[]) => Promise<number>
);
const getRollingWindowConversationCountMock = mock(
	(async () => 0) as (...args: unknown[]) => Promise<number>
);
const getContactCountMock = mock(
	(async () => 0) as (...args: unknown[]) => Promise<number>
);
const getTeamMemberCountMock = mock(
	(async () => 0) as (...args: unknown[]) => Promise<number>
);
const getPlanForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const isPolarEnabledMock = mock(() => false);
const getAiCreditMeterStateMock = mock((async () => ({
	balance: null,
	consumedUnits: null,
	creditedUnits: null,
	meterBacked: false,
	source: "disabled",
	lastSyncedAt: null,
})) as (...args: unknown[]) => Promise<unknown>);
const getDashboardConversationLockCutoffMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const resolveDashboardHardLimitPolicyMock = mock(() => ({
	enforced: false,
	unavailableReason: "billing_disabled",
	windowStart: "2026-04-01T00:00:00.000Z",
	messageLimit: null,
	conversationLimit: null,
}));
const getDiscountInfoMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/db/queries/website", () => ({
	getWebsiteBySlugWithAccess: getWebsiteBySlugWithAccessMock,
	listOrganizationWebsitePlanTargets: listOrganizationWebsitePlanTargetsMock,
}));

mock.module("@api/db/queries/usage", () => ({
	getContactCount: getContactCountMock,
	getRollingWindowConversationCount: getRollingWindowConversationCountMock,
	getRollingWindowMessageCount: getRollingWindowMessageCountMock,
	getTeamMemberCount: getTeamMemberCountMock,
	HARD_LIMIT_ROLLING_WINDOW_DAYS: 30,
}));

mock.module("@api/lib/billing-mode", () => ({
	isPolarEnabled: isPolarEnabledMock,
	getBillingProvider: () => "disabled",
	getBillingStatus: () => ({
		enabled: false,
		provider: "disabled",
		canManageSubscription: false,
	}),
}));

mock.module("@api/lib/hard-limits/dashboard", () => ({
	getDashboardConversationLockCutoff: getDashboardConversationLockCutoffMock,
	resolveDashboardHardLimitPolicy: resolveDashboardHardLimitPolicyMock,
}));

mock.module("@api/lib/ai-credits/polar-meter", () => ({
	getAiCreditMeterState: getAiCreditMeterStateMock,
}));

const SELF_HOSTED_PLAN_INFO = {
	planName: "self_hosted",
	displayName: "Self-Hosted",
	price: undefined,
	features: {
		"latest-ai-models": true,
		"ai-credit": null,
		messages: null,
		conversations: null,
	} as never,
	hardLimitsEnforced: false,
	hardLimitsUnavailableReason: "billing_disabled",
	billing: {
		enabled: false,
		provider: "disabled",
		canManageSubscription: false,
	},
} as const;

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
	getSelfHostedPlanInfo: () => SELF_HOSTED_PLAN_INFO,
}));

mock.module("@api/lib/plans/discount", () => ({
	EARLY_BIRD_DISCOUNT_ID: "early-bird",
	getDiscountInfo: getDiscountInfoMock,
}));

mock.module("@api/lib/plans/polar", () => ({
	getCustomerByOrganizationId: mock(async () => null),
	getCustomerState: mock(async () => null),
	getPlanFromCustomerState: mock(async () => null),
	getSubscriptionForWebsite: mock(() => null),
	normalizeWebsiteSubscriptions: mock(async () => ({
		subscription: null,
		revokedSubscriptionIds: [],
	})),
	requireCustomerByOrganizationId: mock(async () => null),
	updateWebsiteSubscriptionProduct: mock(async () => ({
		status: "failed",
	})),
}));

mock.module("@api/lib/polar", () => ({
	default: {},
}));

mock.module("@api/env", () => ({
	env: {
		PUBLIC_APP_URL: "https://app.cossistant.test",
	},
}));

const modulePromise = Promise.all([import("../init"), import("./plan")]);

const USER_ID = "01ARYZ6S41TSV4RRFFQ69G5FAW";
const ORGANIZATION_ID = "01ARYZ6S41TSV4RRFFQ69G5FAV";
const WEBSITE_ID = "01ARYZ6S41TSV4RRFFQ69G5FAX";

function createDbForPlans(
	websites: Array<{ id: string; organizationId: string }>
) {
	let selectCallCount = 0;

	// The websites the caller declares are served through the extracted query.
	listOrganizationWebsitePlanTargetsMock.mockResolvedValue(websites);

	return {
		select() {
			selectCallCount += 1;

			if (selectCallCount === 1) {
				return {
					from() {
						return {
							where() {
								return {
									limit: async () => [{ userId: USER_ID }],
								};
							},
						};
					},
				};
			}

			return {
				from() {
					return {
						where: async () => websites,
					};
				},
			};
		},
	} as unknown as Database;
}

async function createCaller(db: Database) {
	const [{ createCallerFactory }, { planRouter }] = await modulePromise;
	const createCallerFactoryForRouter = createCallerFactory(planRouter);

	return createCallerFactoryForRouter({
		db,
		user: {
			id: USER_ID,
			name: "Anthony",
			email: "anthony@cossistant.com",
		} as never,
		session: { id: "session_1" } as never,
		geo: {} as never,
		headers: new Headers(),
	});
}

describe("plan router self-hosted billing mode", () => {
	beforeEach(() => {
		getWebsiteBySlugWithAccessMock.mockReset();
		listOrganizationWebsitePlanTargetsMock.mockReset();
		listOrganizationWebsitePlanTargetsMock.mockResolvedValue([]);
		getRollingWindowMessageCountMock.mockReset();
		getRollingWindowConversationCountMock.mockReset();
		getContactCountMock.mockReset();
		getTeamMemberCountMock.mockReset();
		getPlanForWebsiteMock.mockReset();
		getAiCreditMeterStateMock.mockReset();
		getDashboardConversationLockCutoffMock.mockReset();
		resolveDashboardHardLimitPolicyMock.mockReset();
		getDiscountInfoMock.mockReset();
		isPolarEnabledMock.mockReset();

		isPolarEnabledMock.mockReturnValue(false);
		getWebsiteBySlugWithAccessMock.mockResolvedValue({
			id: WEBSITE_ID,
			organizationId: ORGANIZATION_ID,
			teamId: "team_1",
		});
		getRollingWindowMessageCountMock.mockResolvedValue(12);
		getRollingWindowConversationCountMock.mockResolvedValue(4);
		getContactCountMock.mockResolvedValue(9);
		getTeamMemberCountMock.mockResolvedValue(2);
		getPlanForWebsiteMock.mockResolvedValue(SELF_HOSTED_PLAN_INFO);
		getAiCreditMeterStateMock.mockResolvedValue({
			balance: null,
			consumedUnits: null,
			creditedUnits: null,
			meterBacked: false,
			source: "disabled",
			lastSyncedAt: null,
		});
		getDashboardConversationLockCutoffMock.mockResolvedValue(null);
		resolveDashboardHardLimitPolicyMock.mockReturnValue({
			enforced: false,
			unavailableReason: "billing_disabled",
			windowStart: "2026-04-01T00:00:00.000Z",
			messageLimit: null,
			conversationLimit: null,
		});
		getDiscountInfoMock.mockResolvedValue(null);
	});

	it("returns self-hosted billing metadata from getPlanInfo", async () => {
		const caller = await createCaller({} as Database);

		const result = await caller.getPlanInfo({
			websiteSlug: "acme",
		});

		expect(result.plan.name).toBe("self_hosted");
		expect(result.billing).toEqual({
			enabled: false,
			provider: "disabled",
			canManageSubscription: false,
		});
		expect(result.aiCredits.source).toBe("disabled");
		expect(result.hardLimitStatus.enforced).toBe(false);
	});

	it("returns self-hosted plans for every website in an organization", async () => {
		const caller = await createCaller(
			createDbForPlans([
				{ id: WEBSITE_ID, organizationId: ORGANIZATION_ID },
				{ id: "site_2", organizationId: ORGANIZATION_ID },
			])
		);

		const result = await caller.getPlansForOrganization({
			organizationId: ORGANIZATION_ID,
		});

		expect(result).toEqual([
			{
				websiteId: WEBSITE_ID,
				planName: "self_hosted",
				displayName: "Self-Hosted",
			},
			{
				websiteId: "site_2",
				planName: "self_hosted",
				displayName: "Self-Hosted",
			},
		]);
	});

	it("rejects checkout creation when billing is disabled", async () => {
		const caller = await createCaller({} as Database);

		await expect(
			caller.createCheckout({
				websiteSlug: "acme",
				targetPlan: "pro",
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Billing is disabled for this deployment.",
		});
	});
});
