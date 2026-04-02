import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { createMemoryTool } from "@plasma/memory";

type GenericMemoryTools = ReturnType<typeof createMemoryTool>;

const rememberTool = {
	description: "remember tool",
} as unknown as GenericMemoryTools["remember"];
const recallMemoryTool = {
	description: "recall tool",
} as unknown as GenericMemoryTools["recallMemory"];

const createMemoryToolMock = mock((() => ({
	remember: rememberTool,
	recallMemory: recallMemoryTool,
})) as (...args: unknown[]) => {
	remember: typeof rememberTool;
	recallMemory: typeof recallMemoryTool;
});

mock.module("@plasma/memory", () => ({
	createMemoryTool: createMemoryToolMock,
}));

const modulePromise = import("./memory");

describe("scoped memory tool wrappers", () => {
	beforeEach(() => {
		createMemoryToolMock.mockReset();
		createMemoryToolMock.mockReturnValue({
			remember: rememberTool,
			recallMemory: recallMemoryTool,
		});
	});

	it("visitor wrapper binds visitor-only scope and aliases generic tools", async () => {
		const { createVisitorMemoryTools } = await modulePromise;
		const memory = {} as never;

		const result = createVisitorMemoryTools({
			memory,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgentId: "agent_1",
			visitorId: "visitor_1",
			recallDefaults: {
				limit: 6,
				includeSummary: true,
			},
		});

		expect(createMemoryToolMock).toHaveBeenCalledWith({
			memory,
			remember: {
				metadata: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
				},
				description: expect.stringContaining("visitor"),
			},
			recall: {
				where: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
				},
				defaults: {
					limit: 6,
					includeSummary: true,
				},
				description: expect.stringContaining("visitor"),
			},
		});
		expect(result).toEqual({
			rememberVisitor: rememberTool,
			recallVisitorMemory: recallMemoryTool,
		});
	});

	it("conversation wrapper binds conversation scope on write and read", async () => {
		const { createConversationMemoryTools } = await modulePromise;
		const memory = {} as never;

		const result = createConversationMemoryTools({
			memory,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgentId: "agent_1",
			visitorId: "visitor_1",
			conversationId: "conv_1",
		});

		expect(createMemoryToolMock).toHaveBeenCalledWith({
			memory,
			remember: {
				metadata: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
					conversationId: "conv_1",
				},
				description: expect.stringContaining("conversation"),
			},
			recall: {
				where: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
					conversationId: "conv_1",
				},
				defaults: undefined,
				description: expect.stringContaining("conversation"),
			},
		});
		expect(result).toEqual({
			rememberConversation: rememberTool,
			recallConversationMemory: recallMemoryTool,
		});
	});

	it("website wrapper binds website scope only", async () => {
		const { createWebsiteMemoryTools } = await modulePromise;
		const memory = {} as never;

		const result = createWebsiteMemoryTools({
			memory,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgentId: "agent_1",
			recallDefaults: {
				limit: 4,
				includeSummary: false,
			},
		});

		expect(createMemoryToolMock).toHaveBeenCalledWith({
			memory,
			remember: {
				metadata: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
				},
				description: expect.stringContaining("website"),
			},
			recall: {
				where: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
				},
				defaults: {
					limit: 4,
					includeSummary: false,
				},
				description: expect.stringContaining("website"),
			},
		});
		expect(result).toEqual({
			rememberWebsite: rememberTool,
			recallWebsiteMemory: recallMemoryTool,
		});
	});

	it("wrappers only alias the generic package tools", async () => {
		const { createVisitorMemoryTools } = await modulePromise;
		const memory = {} as never;

		const result = createVisitorMemoryTools({
			memory,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgentId: "agent_1",
			visitorId: "visitor_1",
		});

		expect(result.rememberVisitor).toBe(rememberTool);
		expect(result.recallVisitorMemory).toBe(recallMemoryTool);
		expect(createMemoryToolMock).toHaveBeenCalledTimes(1);
	});
});
