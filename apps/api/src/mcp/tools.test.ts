import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getSupportConversationMock = mock((async () => ({
	conversation: { id: "conv-1" },
})) as (...args: unknown[]) => Promise<unknown>);
const listAccessibleWebsitesMock = mock((async () => [
	{ id: "site-1", name: "Acme Support" },
]) as (...args: unknown[]) => Promise<unknown>);
const listSupportConversationsMock = mock((async () => ({
	items: [],
	nextCursor: null,
})) as (...args: unknown[]) => Promise<unknown>);
const searchSupportKnowledgeMock = mock((async () => ({ results: [] })) as (
	...args: unknown[]
) => Promise<unknown>);

mock.module("@api/support-capabilities", () => ({
	getSupportConversation: getSupportConversationMock,
	listAccessibleWebsites: listAccessibleWebsitesMock,
	listSupportConversations: listSupportConversationsMock,
	searchSupportKnowledge: searchSupportKnowledgeMock,
	SupportCapabilityError: class SupportCapabilityError extends Error {
		status: number;
		code: string;

		constructor(status: number, code: string, message: string) {
			super(message);
			this.status = status;
			this.code = code;
		}
	},
}));

type ToolCallback = (input: Record<string, unknown>) => Promise<unknown>;

const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const consoleInfoMock = mock(() => {});
const consoleWarnMock = mock(() => {});

function createFakeServer() {
	const tools = new Map<string, ToolCallback>();

	return {
		server: {
			registerTool: mock(
				(name: string, _options: unknown, callback: ToolCallback) => {
					tools.set(name, callback);
				}
			),
		},
		tools,
	};
}

const modulePromise = import("./tools");

describe("registerCossistantMcpTools", () => {
	afterAll(() => {
		console.info = originalConsoleInfo;
		console.warn = originalConsoleWarn;
		mock.restore();
	});

	beforeEach(() => {
		console.info = consoleInfoMock as typeof console.info;
		console.warn = consoleWarnMock as typeof console.warn;
		consoleInfoMock.mockClear();
		consoleWarnMock.mockClear();
		getSupportConversationMock.mockClear();
		listAccessibleWebsitesMock.mockClear();
		listSupportConversationsMock.mockClear();
		searchSupportKnowledgeMock.mockClear();
	});

	it("registers the read-only MVP tools", async () => {
		const { registerCossistantMcpTools } = await modulePromise;
		const { server, tools } = createFakeServer();

		registerCossistantMcpTools(server as never, {
			db: {} as never,
			jwt: { sub: "user-1", client_id: "client-1" },
		});

		expect([...tools.keys()].sort()).toEqual([
			"cossistant_get_conversation",
			"cossistant_list_conversations",
			"cossistant_list_websites",
			"cossistant_search_knowledge",
		]);
	});

	it("delegates tool calls to shared support capabilities", async () => {
		const { registerCossistantMcpTools } = await modulePromise;
		const { server, tools } = createFakeServer();

		registerCossistantMcpTools(server as never, {
			db: {} as never,
			jwt: { sub: "user-1", client_id: "client-1" },
		});

		await tools.get("cossistant_list_websites")?.({ limit: 2 });
		await tools.get("cossistant_search_knowledge")?.({
			websiteId: "site-1",
			query: "billing",
			limit: 4,
			minSimilarity: 0.3,
		});
		await tools.get("cossistant_list_conversations")?.({
			websiteId: "site-1",
			limit: 10,
			cursor: null,
			orderBy: "updatedAt",
			order: "desc",
		});
		await tools.get("cossistant_get_conversation")?.({
			websiteId: "site-1",
			conversationId: "conv-1",
			timelineLimit: 25,
			timelineCursor: null,
			feedbackLimit: 10,
		});

		expect(listAccessibleWebsitesMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ userId: "user-1", limit: 2 })
		);
		expect(searchSupportKnowledgeMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				userId: "user-1",
				websiteId: "site-1",
				maxContentLength: 1200,
			})
		);
		expect(listSupportConversationsMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				userId: "user-1",
				actorUserId: "user-1",
				websiteId: "site-1",
			})
		);
		expect(getSupportConversationMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				userId: "user-1",
				actorUserId: "user-1",
				websiteId: "site-1",
				conversationId: "conv-1",
			})
		);
	});
});
