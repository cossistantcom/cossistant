import { beforeEach, describe, expect, it, mock } from "bun:test";

const dbMock = {} as never;

const getActiveAiAgentForWebsiteMock = mock(
	async () => ({ id: "ai-1" }) as { id: string } | null
);
const enqueueAiAgentJobMock = mock(
	async (): Promise<
		{ status: "created" } | { status: "skipped"; existingState: string }
	> => ({
		status: "created",
	})
);
const getAiAgentQueueTriggersMock = mock(() => ({
	enqueueAiAgentJob: enqueueAiAgentJobMock,
}));

mock.module("@api/db", () => ({
	db: dbMock,
}));

mock.module("@api/db/queries/ai-agent", () => ({
	getActiveAiAgentForWebsite: getActiveAiAgentForWebsiteMock,
}));

mock.module("@api/utils/queue-triggers", () => ({
	getAiAgentQueueTriggers: getAiAgentQueueTriggersMock,
}));

mock.module("@plasma/jobs", () => ({
	AI_AGENT_INITIAL_DELAY_MS: 5000,
}));

const aiTriggerServiceModulePromise = import("./ai-trigger-service");

const defaultParams = {
	conversationId: "conv-1",
	messageId: "msg-1",
	messageCreatedAt: "2026-02-25T10:00:00.000Z",
	websiteId: "site-1",
	organizationId: "org-1",
};

describe("enqueueAiAgentTrigger", () => {
	beforeEach(() => {
		getActiveAiAgentForWebsiteMock.mockReset();
		enqueueAiAgentJobMock.mockReset();
		getAiAgentQueueTriggersMock.mockReset();

		getActiveAiAgentForWebsiteMock.mockResolvedValue({ id: "ai-1" });
		enqueueAiAgentJobMock.mockResolvedValue({ status: "created" });
		getAiAgentQueueTriggersMock.mockReturnValue({
			enqueueAiAgentJob: enqueueAiAgentJobMock,
		});
	});

	it("returns skipped when there is no active AI agent", async () => {
		getActiveAiAgentForWebsiteMock.mockResolvedValue(null);
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "skipped",
			reason: "no_active_agent",
		});
		expect(enqueueAiAgentJobMock).not.toHaveBeenCalled();
	});

	it("enqueues a single-message job when no conversation job exists", async () => {
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "queued",
			aiAgentId: "ai-1",
		});
		expect(enqueueAiAgentJobMock).toHaveBeenCalledWith(
			{
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				messageId: "msg-1",
				messageCreatedAt: "2026-02-25T10:00:00.000Z",
				runAttempt: 0,
			},
			{ delayMs: 5000 }
		);
	});

	it("treats existing active/waiting/delayed conversation jobs as already queued", async () => {
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		for (const existingState of ["active", "waiting", "delayed"] as const) {
			enqueueAiAgentJobMock.mockResolvedValueOnce({
				status: "skipped",
				existingState,
			});

			const result = await enqueueAiAgentTrigger(defaultParams);

			expect(result).toEqual({
				status: "alreadyQueued",
				aiAgentId: "ai-1",
			});
		}

		expect(enqueueAiAgentJobMock).toHaveBeenCalledTimes(3);
	});
});
