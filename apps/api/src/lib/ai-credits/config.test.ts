import { describe, expect, it } from "bun:test";
import {
	calculateAiCreditCharge,
	getAiModelsForPlan,
	getAiThinkingReasoningMaxTokens,
	getAiThinkingSurchargeCredits,
	getDefaultModelId,
	getMinimumAiCreditCharge,
	getModelSurchargeCredits,
	getToolCallStats,
	getToolCredits,
	isAiThinkingSupported,
	isExcludedToolName,
	isHighEndModel,
	isKnownModel,
	isModelAllowedForPlan,
	isOutageAllowedModel,
	resolveClarificationModelForExecution,
	resolveModelForExecution,
} from "./config";

describe("ai credit pricing config", () => {
	it("charges base credits for non-high-end models", () => {
		const charge = getMinimumAiCreditCharge("moonshotai/kimi-k2-0905");

		expect(charge.baseCredits).toBe(1);
		expect(charge.modelCredits).toBe(0);
		expect(charge.thinkingCredits).toBe(0);
		expect(charge.totalCredits).toBe(1);
	});

	it("adds surcharge for high-end models", () => {
		expect(isHighEndModel("openai/gpt-5.2-chat")).toBe(true);
		expect(getModelSurchargeCredits("openai/gpt-5.2-chat")).toBe(1);

		const charge = getMinimumAiCreditCharge("openai/gpt-5.2-chat");

		expect(charge.baseCredits).toBe(1);
		expect(charge.modelCredits).toBe(1);
		expect(charge.thinkingCredits).toBe(0);
		expect(charge.totalCredits).toBe(2);
	});

	it("adds new model catalog entries with model-aware thinking metadata", () => {
		expect(isKnownModel("openai/gpt-5.5")).toBe(true);
		expect(isKnownModel("moonshotai/kimi-k2.6")).toBe(true);
		expect(getModelSurchargeCredits("openai/gpt-5.5")).toBe(3.5);
		expect(getModelSurchargeCredits("moonshotai/kimi-k2.6")).toBe(0.5);
		expect(isAiThinkingSupported("openai/gpt-5.5")).toBe(true);
		expect(isAiThinkingSupported("moonshotai/kimi-k2.6")).toBe(true);
		expect(isAiThinkingSupported("openai/gpt-5.2-chat")).toBe(false);
		expect(getAiThinkingSurchargeCredits("openai/gpt-5.5")).toBe(3);
		expect(getAiThinkingSurchargeCredits("moonshotai/kimi-k2.6")).toBe(0.5);
		expect(getAiThinkingReasoningMaxTokens("openai/gpt-5.5")).toBe(512);
		expect(getAiThinkingReasoningMaxTokens("openai/gpt-5.2-chat")).toBeNull();
	});

	it("charges thinking only when enabled and supported", () => {
		const premiumThinkingCharge = getMinimumAiCreditCharge("openai/gpt-5.5", {
			aiThinkingEnabled: true,
		});
		expect(premiumThinkingCharge.baseCredits).toBe(1);
		expect(premiumThinkingCharge.modelCredits).toBe(3.5);
		expect(premiumThinkingCharge.thinkingCredits).toBe(3);
		expect(premiumThinkingCharge.totalCredits).toBe(7.5);

		const unsupportedThinkingCharge = getMinimumAiCreditCharge(
			"openai/gpt-5.2-chat",
			{
				aiThinkingEnabled: true,
			}
		);
		expect(unsupportedThinkingCharge.thinkingCredits).toBe(0);
		expect(unsupportedThinkingCharge.totalCredits).toBe(2);
	});

	it("counts excluded tools and billable tools correctly", () => {
		expect(isExcludedToolName("sendMessage")).toBe(true);
		expect(isExcludedToolName("respond")).toBe(true);
		expect(isExcludedToolName("loadSkill")).toBe(true);
		expect(isExcludedToolName("searchKnowledgeBase")).toBe(false);

		const stats = getToolCallStats({
			sendMessage: 4,
			sendPrivateMessage: 1,
			loadSkill: 3,
			searchKnowledgeBase: 2,
			respond: 1,
			ignoreInvalid: -3,
		});

		expect(stats.totalToolCount).toBe(11);
		expect(stats.excludedToolCount).toBe(9);
		expect(stats.billableToolCount).toBe(2);
	});

	it("applies tool surcharge only after included billable tools", () => {
		expect(getToolCredits(0)).toBe(0);
		expect(getToolCredits(2)).toBe(0);
		expect(getToolCredits(3)).toBe(0.5);
		expect(getToolCredits(5)).toBe(1.5);
	});

	it("computes full charge with rounding stability", () => {
		const charge = calculateAiCreditCharge({
			modelId: "openai/gpt-5.1-chat",
			toolCallsByName: {
				sendMessage: 1,
				searchKnowledgeBase: 3,
				respond: 1,
			},
		});

		expect(charge.baseCredits).toBe(1);
		expect(charge.modelCredits).toBe(1);
		expect(charge.thinkingCredits).toBe(0);
		expect(charge.billableToolCount).toBe(3);
		expect(charge.excludedToolCount).toBe(2);
		expect(charge.toolCredits).toBe(0.5);
		expect(charge.totalCredits).toBe(2.5);
	});

	it("exposes one default model and resolves unknown models to default", () => {
		const defaultModelId = getDefaultModelId();
		expect(defaultModelId).toBe("moonshotai/kimi-k2-0905");

		const resolution = resolveModelForExecution("anthropic/claude-sonnet-4");
		expect(resolution.modelMigrationApplied).toBe(true);
		expect(resolution.modelIdOriginal).toBe("anthropic/claude-sonnet-4");
		expect(resolution.modelIdResolved).toBe(defaultModelId);
	});

	it("routes known clarification models to gemini flash", () => {
		const resolution = resolveClarificationModelForExecution(
			"moonshotai/kimi-k2-0905"
		);

		expect(resolution.modelMigrationApplied).toBe(true);
		expect(resolution.modelIdOriginal).toBe("moonshotai/kimi-k2-0905");
		expect(resolution.modelIdResolved).toBe("google/gemini-3-flash-preview");
	});

	it("keeps gemini flash unchanged for clarification runs", () => {
		const resolution = resolveClarificationModelForExecution(
			"google/gemini-3-flash-preview"
		);

		expect(resolution.modelMigrationApplied).toBe(false);
		expect(resolution.modelIdOriginal).toBe("google/gemini-3-flash-preview");
		expect(resolution.modelIdResolved).toBe("google/gemini-3-flash-preview");
	});

	it("routes unknown clarification models to gemini flash", () => {
		const resolution = resolveClarificationModelForExecution(
			"anthropic/claude-sonnet-4"
		);

		expect(resolution.modelMigrationApplied).toBe(true);
		expect(resolution.modelIdOriginal).toBe("anthropic/claude-sonnet-4");
		expect(resolution.modelIdResolved).toBe("google/gemini-3-flash-preview");
	});

	it("knows outage allowlist and plan entitlement from the same catalog", () => {
		expect(isKnownModel("moonshotai/kimi-k2.5")).toBe(true);
		expect(isKnownModel("moonshotai/kimi-k2.6")).toBe(true);
		expect(isKnownModel("unknown/model")).toBe(false);
		expect(isOutageAllowedModel("moonshotai/kimi-k2.5")).toBe(true);
		expect(isOutageAllowedModel("moonshotai/kimi-k2.6")).toBe(true);
		expect(isOutageAllowedModel("openai/gpt-5.1-chat")).toBe(false);

		expect(
			isModelAllowedForPlan({
				modelId: "openai/gpt-5.1-chat",
				latestModelsFeature: true,
			})
		).toBe(true);
		expect(
			isModelAllowedForPlan({
				modelId: "openai/gpt-5.1-chat",
				latestModelsFeature: false,
			})
		).toBe(false);
		expect(
			isModelAllowedForPlan({
				modelId: "unknown/model",
				latestModelsFeature: true,
			})
		).toBe(false);
	});

	it("builds plan model view with selectable flags", () => {
		const freeView = getAiModelsForPlan(false);
		expect(freeView.defaultModelId).toBe("moonshotai/kimi-k2-0905");
		expect(
			freeView.items.find((model) => model.id === "openai/gpt-5.2-chat")
				?.selectableForCurrentPlan
		).toBe(false);
		expect(
			freeView.items.find((model) => model.id === "openai/gpt-5.5")
				?.selectableForCurrentPlan
		).toBe(false);
		expect(
			freeView.items.find((model) => model.id === "moonshotai/kimi-k2-0905")
				?.selectableForCurrentPlan
		).toBe(true);
		expect(
			freeView.items.find((model) => model.id === "moonshotai/kimi-k2.6")
				?.thinkingSupported
		).toBe(true);
		expect(
			freeView.items.find((model) => model.id === "moonshotai/kimi-k2.6")
				?.thinkingSurchargeCredits
		).toBe(0.5);

		const paidView = getAiModelsForPlan(true);
		expect(
			paidView.items.find((model) => model.id === "openai/gpt-5.2-chat")
				?.selectableForCurrentPlan
		).toBe(true);
		expect(
			paidView.items.find((model) => model.id === "openai/gpt-5.5")
				?.selectableForCurrentPlan
		).toBe(true);
	});
});
