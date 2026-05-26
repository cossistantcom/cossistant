import { beforeEach, describe, expect, it, mock } from "bun:test";

const createTimelineItemMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const updateTimelineItemMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
	updateTimelineItem: updateTimelineItemMock,
}));

const timelineModulePromise = import("./timeline");

describe("AI credit timeline logging", () => {
	beforeEach(() => {
		createTimelineItemMock.mockReset();
		updateTimelineItemMock.mockReset();
		createTimelineItemMock.mockResolvedValue({});
		updateTimelineItemMock.mockResolvedValue({});
	});

	it("writes a private tool timeline row with credit payload", async () => {
		const { logAiCreditUsageTimeline } = await timelineModulePromise;

		await logAiCreditUsageTimeline({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			workflowRunId: "wf-1",
			triggerMessageId: "msg-1",
			triggerVisibility: "public",
			payload: {
				baseCredits: 1,
				modelCredits: 1,
				thinkingCredits: 0,
				toolCredits: 0.5,
				totalCredits: 2.5,
				billableToolCount: 3,
				excludedToolCount: 1,
				modelId: "openai/gpt-5.2-chat",
				balanceBefore: 10,
				balanceAfterEstimate: 7.5,
				mode: "normal",
				ingestStatus: "ingested",
			},
		});

		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		const createCall = createTimelineItemMock.mock.calls[0]?.[0] as {
			item: { visibility: string; parts: Record<string, unknown>[] };
		};
		expect(createCall?.item.visibility).toBe("private");
		expect(createCall?.item.parts[0]?.toolName).toBe("aiCreditUsage");
		expect(createCall?.item.parts[0]?.output).toMatchObject({
			totalCredits: 2.5,
			mode: "normal",
		});
	});
});
