import { beforeEach, describe, expect, it, mock } from "bun:test";

const getAiCreditMeterStateMock = mock((async () => ({
	organizationId: "org-1",
	meterId: "meter-1",
	balance: 100,
	consumedUnits: 10,
	creditedUnits: 110,
	meterBacked: true,
	source: "live" as const,
	lastSyncedAt: new Date().toISOString(),
	outage: false,
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("./polar-meter", () => ({
	getAiCreditMeterState: getAiCreditMeterStateMock,
}));

const guardModulePromise = import("./guard");

describe("guardAiCreditRun", () => {
	beforeEach(() => {
		getAiCreditMeterStateMock.mockReset();
	});

	it("allows run when balance covers minimum credits", async () => {
		getAiCreditMeterStateMock.mockResolvedValue({
			organizationId: "org-1",
			meterId: "meter-1",
			balance: 10,
			consumedUnits: 0,
			creditedUnits: 10,
			meterBacked: true,
			source: "live",
			lastSyncedAt: new Date().toISOString(),
			outage: false,
		});

		const { guardAiCreditRun } = await guardModulePromise;
		const result = await guardAiCreditRun({
			organizationId: "org-1",
			modelId: "moonshotai/kimi-k2-0905",
		});

		expect(result.allowed).toBe(true);
		expect(result.mode).toBe("normal");
		expect(result.blockedReason).toBeNull();
		expect(result.minimumCharge.totalCredits).toBe(1);
	});

	it("blocks run when balance is below minimum credits", async () => {
		getAiCreditMeterStateMock.mockResolvedValue({
			organizationId: "org-1",
			meterId: "meter-1",
			balance: 0.5,
			consumedUnits: 99.5,
			creditedUnits: 100,
			meterBacked: true,
			source: "live",
			lastSyncedAt: new Date().toISOString(),
			outage: false,
		});

		const { guardAiCreditRun } = await guardModulePromise;
		const result = await guardAiCreditRun({
			organizationId: "org-1",
			modelId: "openai/gpt-5.2-chat",
		});

		expect(result.allowed).toBe(false);
		expect(result.mode).toBe("normal");
		expect(result.blockedReason).toBe("insufficient_credits");
		expect(result.minimumCharge.totalCredits).toBe(2);
	});

	it("includes thinking credits in the minimum charge", async () => {
		getAiCreditMeterStateMock.mockResolvedValue({
			organizationId: "org-1",
			meterId: "meter-1",
			balance: 7,
			consumedUnits: 0,
			creditedUnits: 7,
			meterBacked: true,
			source: "live",
			lastSyncedAt: new Date().toISOString(),
			outage: false,
		});

		const { guardAiCreditRun } = await guardModulePromise;
		const result = await guardAiCreditRun({
			organizationId: "org-1",
			modelId: "openai/gpt-5.5",
			aiThinkingEnabled: true,
		});

		expect(result.allowed).toBe(false);
		expect(result.blockedReason).toBe("insufficient_credits");
		expect(result.minimumCharge.modelCredits).toBe(3.5);
		expect(result.minimumCharge.thinkingCredits).toBe(3);
		expect(result.minimumCharge.totalCredits).toBe(7.5);
	});

	it("allows outage fallback for allowed models", async () => {
		getAiCreditMeterStateMock.mockResolvedValue({
			organizationId: "org-1",
			meterId: null,
			balance: null,
			consumedUnits: null,
			creditedUnits: null,
			meterBacked: false,
			source: "outage",
			lastSyncedAt: new Date().toISOString(),
			outage: true,
			outageReason: "polar_error",
		});

		const { guardAiCreditRun } = await guardModulePromise;
		const result = await guardAiCreditRun({
			organizationId: "org-1",
			modelId: "moonshotai/kimi-k2.5",
		});

		expect(result.allowed).toBe(true);
		expect(result.mode).toBe("outage");
		expect(result.blockedReason).toBeNull();
	});

	it("fails closed when meter is not configured", async () => {
		getAiCreditMeterStateMock.mockResolvedValue({
			organizationId: "org-1",
			meterId: null,
			balance: null,
			consumedUnits: null,
			creditedUnits: null,
			meterBacked: false,
			source: "outage",
			lastSyncedAt: new Date().toISOString(),
			outage: true,
			outageReason: "meter_not_configured",
		});

		const { guardAiCreditRun } = await guardModulePromise;
		const result = await guardAiCreditRun({
			organizationId: "org-1",
			modelId: "moonshotai/kimi-k2.5",
		});

		expect(result.allowed).toBe(false);
		expect(result.blockedReason).toBe("meter_configuration_invalid");
		expect(result.mode).toBe("normal");
	});

	it("blocks outage mode for non-allowlisted models", async () => {
		getAiCreditMeterStateMock.mockResolvedValue({
			organizationId: "org-1",
			meterId: null,
			balance: null,
			consumedUnits: null,
			creditedUnits: null,
			meterBacked: false,
			source: "outage",
			lastSyncedAt: new Date().toISOString(),
			outage: true,
			outageReason: "polar_error",
		});

		const { guardAiCreditRun } = await guardModulePromise;
		const result = await guardAiCreditRun({
			organizationId: "org-1",
			modelId: "openai/gpt-5.2-chat",
		});

		expect(result.allowed).toBe(false);
		expect(result.mode).toBe("outage");
		expect(result.blockedReason).toBe("outage_model_not_allowed");
	});

	it("allows runs without metering when billing is disabled", async () => {
		getAiCreditMeterStateMock.mockResolvedValue({
			organizationId: "org-1",
			meterId: null,
			balance: null,
			consumedUnits: null,
			creditedUnits: null,
			meterBacked: false,
			source: "disabled",
			lastSyncedAt: new Date().toISOString(),
			outage: false,
		});

		const { guardAiCreditRun } = await guardModulePromise;
		const result = await guardAiCreditRun({
			organizationId: "org-1",
			modelId: "openai/gpt-5.2-chat",
		});

		expect(result.allowed).toBe(true);
		expect(result.mode).toBe("normal");
		expect(result.blockedReason).toBeNull();
		expect(result.meterSource).toBe("disabled");
	});
});
