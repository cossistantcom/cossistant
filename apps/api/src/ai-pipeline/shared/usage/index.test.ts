import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	sharedCalculateAiCreditChargeMock as calculateAiCreditChargeMock,
	sharedCreateTimelineItemMock as createTimelineItemMock,
	sharedGetMinimumAiCreditChargeMock as getMinimumAiCreditChargeMock,
	sharedResolveClarificationModelForExecutionMock as resolveClarificationModelForExecutionMock,
	sharedUpdateTimelineItemMock as updateTimelineItemMock,
} from "../../../test-support/shared-module-mocks";

const ingestAiCreditUsageMock = mock(async () => ({
	status: "ingested" as const,
}));

const logAiPipelineMock = mock(() => {});

mock.module("@api/lib/ai-credits/config", () => ({
	calculateAiCreditCharge: calculateAiCreditChargeMock,
	getAiThinkingCredits: mock(
		(params: { modelId: string; aiThinkingEnabled?: boolean | null }) =>
			params.aiThinkingEnabled === true && params.modelId === "openai/gpt-5.5"
				? 3
				: 0
	),
	getAiThinkingReasoningMaxTokens: mock(() => 512),
	getMinimumAiCreditCharge: getMinimumAiCreditChargeMock,
	isAiThinkingSupported: mock(
		(modelId: string) => modelId === "openai/gpt-5.5"
	),
	resolveClarificationModelForExecution:
		resolveClarificationModelForExecutionMock,
	resolveModelForExecution: resolveClarificationModelForExecutionMock,
}));

mock.module("@api/lib/ai-credits/polar-meter", () => ({
	ingestAiCreditUsage: ingestAiCreditUsageMock,
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
	updateTimelineItem: updateTimelineItemMock,
}));

mock.module("../../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

async function loadUsageModule() {
	const moduleUrl = new URL("./index.ts", import.meta.url);
	moduleUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
	return import(moduleUrl.href);
}

describe("trackGenerationUsage", () => {
	beforeEach(() => {
		calculateAiCreditChargeMock.mockClear();
		getMinimumAiCreditChargeMock.mockClear();
		ingestAiCreditUsageMock.mockClear();
		logAiPipelineMock.mockClear();
		createTimelineItemMock.mockClear();
		updateTimelineItemMock.mockClear();
		ingestAiCreditUsageMock.mockResolvedValue({
			status: "ingested" as const,
		});
	});

	afterAll(() => {
		mock.restore();
	});

	it("bills and logs conversation-linked clarification planning usage", async () => {
		const { trackGenerationUsage } = await loadUsageModule();

		await trackGenerationUsage({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			conversationId: "conv_1",
			visitorId: "visitor_1",
			aiAgentId: "agent_1",
			usageEventId: "usage_evt_1",
			triggerMessageId: "clar_req_1",
			modelId: "openai/gpt-5.2-chat",
			providerUsage: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
			},
			source: "knowledge_clarification",
			phase: "clarification_plan_generation",
			knowledgeClarificationRequestId: "clar_req_1",
			knowledgeClarificationStepIndex: 2,
		});

		const ingestCall = ingestAiCreditUsageMock.mock.calls[0] as unknown as
			| [Record<string, unknown>]
			| undefined;
		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(ingestCall?.[0]).toMatchObject({
			organizationId: "org_1",
			workflowRunId: "usage_evt_1",
			modelId: "openai/gpt-5.2-chat",
			credits: 1,
		});

		const timelineCreateCall = createTimelineItemMock.mock
			.calls[0] as unknown as [Record<string, unknown>] | undefined;
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(timelineCreateCall?.[0]).toMatchObject({
			conversationId: "conv_1",
			conversationOwnerVisitorId: "visitor_1",
			item: {
				tool: "aiCreditUsage",
				text: "Knowledge clarification planning: 160 tokens, 1 credits",
				aiAgentId: "agent_1",
				visitorId: "visitor_1",
				parts: [
					{
						input: {
							usageEventId: "usage_evt_1",
							triggerMessageId: "clar_req_1",
							source: "knowledge_clarification",
							phase: "clarification_plan_generation",
							knowledgeClarificationRequestId: "clar_req_1",
							knowledgeClarificationStepIndex: 2,
						},
						output: {
							totalTokens: 160,
						},
					},
				],
			},
		});
	});

	it("bills faq-origin clarification usage without creating a conversation timeline item", async () => {
		const { trackGenerationUsage } = await loadUsageModule();

		await trackGenerationUsage({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			usageEventId: "usage_evt_2",
			modelId: "moonshotai/kimi-k2-0905",
			providerUsage: {
				inputTokens: 80,
				outputTokens: 20,
				totalTokens: 100,
			},
			source: "knowledge_clarification",
			phase: "faq_draft_generation",
			knowledgeClarificationRequestId: "clar_req_2",
			knowledgeClarificationStepIndex: 3,
		});

		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(createTimelineItemMock).not.toHaveBeenCalled();
	});

	it("skips Polar ingestion for customer OpenRouter usage while preserving timeline telemetry", async () => {
		const { trackGenerationUsage } = await loadUsageModule();

		const result = await trackGenerationUsage({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			conversationId: "conv_1",
			visitorId: "visitor_1",
			aiAgentId: "agent_1",
			usageEventId: "usage_evt_byok",
			modelId: "openai/gpt-5.2-chat",
			providerUsage: {
				inputTokens: 40,
				outputTokens: 10,
				totalTokens: 50,
			},
			source: "agent_generation",
			billingSource: "customer_openrouter",
		});

		expect(ingestAiCreditUsageMock).not.toHaveBeenCalled();
		expect(result.creditUsage).toMatchObject({
			billingSource: "customer_openrouter",
			ingestStatus: "skipped_customer_openrouter",
			totalCredits: 1,
		});

		const timelineCreateCall = createTimelineItemMock.mock
			.calls[0] as unknown as [Record<string, unknown>] | undefined;
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(timelineCreateCall?.[0]).toMatchObject({
			item: {
				tool: "aiCreditUsage",
				parts: [
					{
						output: {
							totalTokens: 50,
						},
					},
				],
			},
		});
	});

	it("skips Polar ingestion for platform-covered Cossistant fallback usage", async () => {
		const { trackGenerationUsage } = await loadUsageModule();

		const result = await trackGenerationUsage({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			conversationId: "conv_1",
			visitorId: "visitor_1",
			aiAgentId: "agent_1",
			usageEventId: "usage_evt_platform_fallback",
			modelId: "openai/gpt-5.2-chat",
			providerUsage: {
				inputTokens: 40,
				outputTokens: 10,
				totalTokens: 50,
			},
			source: "primary_pipeline",
			billingSource: "cossistant_platform",
		});

		expect(ingestAiCreditUsageMock).not.toHaveBeenCalled();
		expect(result.creditUsage).toMatchObject({
			billingSource: "cossistant_platform",
			ingestStatus: "skipped_cossistant_platform",
			totalCredits: 1,
		});
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
	});
});
