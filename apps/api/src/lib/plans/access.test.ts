import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { website } from "@api/db/schema";
import type { CustomerState, WebsiteSubscription } from "./polar";

const billingStatus = {
	enabled: true,
	provider: "polar",
	canManageSubscription: true,
} as const;

const isPolarEnabledMock = mock(() => false);
const getExternalCustomerMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<{ id: string } | null>
);
const getCustomerStateMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<{
		id: string;
		activeSubscriptions?: Array<{
			id: string;
			productId: string;
			status: string;
			metadata?: Record<string, unknown>;
			createdAt?: Date | string | null;
			currentPeriodStart?: Date | string | null;
		}>;
		grantedBenefits?: Array<{
			id: string;
			benefitId: string;
			benefitType: string;
		}>;
	} | null>
);
const getProductMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<{
		id: string;
		name: string;
	} | null>
);

mock.module("@api/lib/billing-mode", () => ({
	isPolarEnabled: isPolarEnabledMock,
	getBillingStatus: () => billingStatus,
}));

mock.module("@api/lib/polar", () => ({
	default: {
		customers: {
			getExternal: getExternalCustomerMock,
			getState: getCustomerStateMock,
		},
		products: {
			get: getProductMock,
		},
	},
}));

const modulePromise = import("./access");

function buildWebsite(id: string): typeof website.$inferSelect {
	return {
		id,
		organizationId: "org_1",
	} as typeof website.$inferSelect;
}

describe("plan access resolution", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		isPolarEnabledMock.mockReset();
		getExternalCustomerMock.mockReset();
		getCustomerStateMock.mockReset();
		getProductMock.mockReset();

		isPolarEnabledMock.mockReturnValue(false);
		getExternalCustomerMock.mockResolvedValue(null);
		getCustomerStateMock.mockResolvedValue(null);
		getProductMock.mockResolvedValue(null);
	});

	it("returns a synthetic unlimited plan with billing disabled", async () => {
		const { getSelfHostedPlanInfo } = await modulePromise;
		const planInfo = getSelfHostedPlanInfo();

		expect(planInfo.planName).toBe("self_hosted");
		expect(planInfo.displayName).toBe("Self-Hosted");
		expect(planInfo.billing).toEqual({
			enabled: false,
			provider: "disabled",
			canManageSubscription: false,
		});
		expect(planInfo.hardLimitsEnforced).toBe(false);
		expect(planInfo.hardLimitsUnavailableReason).toBe("billing_disabled");
		expect(planInfo.features.contacts).toBeNull();
		expect(planInfo.features.messages).toBeNull();
		expect(planInfo.features["team-members"]).toBeNull();
		expect(planInfo.features["latest-ai-models"]).toBe(true);
		expect(planInfo.features["dashboard-file-sharing"]).toBe(true);
		expect(planInfo.features["custom-ai-agent-avatar"]).toBe(true);
		expect(planInfo.features["ai-agent-training-interval"]).toBe(0);
	});

	it("marks free-looking plans ambiguous when an unscoped paid subscription exists", async () => {
		const { getPlanForWebsite } = await modulePromise;
		const customerState: CustomerState = {
			customerId: "cus_1",
			activeSubscriptions: [],
			grantedBenefits: [],
		};
		const unscopedPaidSubscription: WebsiteSubscription = {
			id: "sub_hobby",
			productId: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
			status: "active",
			metadata: {},
		};

		isPolarEnabledMock.mockReturnValue(true);
		getExternalCustomerMock.mockResolvedValue({ id: "cus_1" });
		getCustomerStateMock.mockResolvedValue({
			id: customerState.customerId,
			activeSubscriptions: [unscopedPaidSubscription],
			grantedBenefits: [],
		});

		const planInfo = await getPlanForWebsite(buildWebsite("site_ambiguous"));

		expect(planInfo.planName).toBe("free");
		expect(planInfo.features.contacts).toBe(25);
		expect(planInfo.hardLimitsEnforced).toBe(false);
		expect(planInfo.hardLimitsUnavailableReason).toBe(
			"billing_scope_ambiguous"
		);
	});

	it("keeps hard limits enforced when a website-scoped paid plan resolves", async () => {
		const { getPlanForWebsite } = await modulePromise;
		const customerState: CustomerState = {
			customerId: "cus_1",
			activeSubscriptions: [],
			grantedBenefits: [],
		};
		const websiteSubscription: WebsiteSubscription = {
			id: "sub_hobby",
			productId: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
			status: "active",
			metadata: { websiteId: "site_hobby" },
		};

		isPolarEnabledMock.mockReturnValue(true);
		getExternalCustomerMock.mockResolvedValue({ id: "cus_1" });
		getCustomerStateMock.mockResolvedValue({
			id: customerState.customerId,
			activeSubscriptions: [
				websiteSubscription,
				{
					id: "sub_unscoped_hobby",
					productId: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
					status: "active",
					metadata: {},
				},
			],
			grantedBenefits: [],
		});
		getProductMock.mockResolvedValue({
			id: "b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
			name: "Hobby",
		});

		const planInfo = await getPlanForWebsite(buildWebsite("site_hobby"));

		expect(planInfo.planName).toBe("hobby");
		expect(planInfo.features.contacts).toBe(2000);
		expect(planInfo.hardLimitsEnforced).toBe(true);
		expect(planInfo.hardLimitsUnavailableReason).toBeNull();
	});
});
