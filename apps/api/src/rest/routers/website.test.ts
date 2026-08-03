import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);
const upsertVisitorMock = mock((async () => ({
	id: "visitor-1",
	blockedAt: null,
	language: null,
})) as (...args: unknown[]) => Promise<unknown>);
const getContactForVisitorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const listWebsiteAccessUsersMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);
// The route reads AI agents through this query rather than db.query.aiAgent.
const listActiveAiAgentSummariesForWebsiteMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries", () => ({
	upsertVisitor: upsertVisitorMock,
}));

mock.module("@api/db/queries/contact", () => ({
	getContactForVisitor: getContactForVisitorMock,
}));

mock.module("@api/lib/team-seats", () => ({
	listWebsiteAccessUsers: listWebsiteAccessUsersMock,
}));

mock.module("@api/db/queries/ai-agent", () => ({
	listActiveAiAgentSummariesForWebsite:
		listActiveAiAgentSummariesForWebsiteMock,
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
}));

const websiteRouterModulePromise = import("./website");

function createWebsiteAccessUser(
	overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
	return {
		userId: "user-1",
		name: "Anthony",
		email: "anthony@example.com",
		image: null,
		lastSeenAt: null,
		joinedAt: new Date("2026-03-01T00:00:00.000Z"),
		updatedAt: new Date("2026-03-01T00:00:00.000Z"),
		role: "member",
		...overrides,
	};
}

function createWebsiteContext(
	overrides: Partial<Record<string, unknown>> = {}
) {
	const findManyMock = mock((async () => []) as (
		...args: unknown[]
	) => Promise<unknown>);
	// Tests declare their agents via findManyMock; serve the extracted query from
	// the same fixture so those call sites keep working.
	listActiveAiAgentSummariesForWebsiteMock.mockImplementation(
		async () => await findManyMock()
	);
	const db = {
		query: {
			aiAgent: {
				findMany: findManyMock,
			},
		},
	};

	return {
		db,
		findManyMock,
		website: {
			id: "site-1",
			name: "Acme",
			domain: "acme.test",
			description: null,
			logoUrl: null,
			organizationId: "org-1",
			status: "active",
			teamId: "team-1",
			...overrides,
		},
	};
}

describe("website route GET /", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		validateResponseMock.mockReset();
		upsertVisitorMock.mockReset();
		getContactForVisitorMock.mockReset();
		listWebsiteAccessUsersMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		upsertVisitorMock.mockResolvedValue({
			id: "visitor-1",
			blockedAt: null,
			language: null,
		});
		getContactForVisitorMock.mockResolvedValue(null);
		listWebsiteAccessUsersMock.mockResolvedValue([]);
	});

	it("uses website-access users, normalizes blank names, and includes email for avatar fallbacks", async () => {
		const { db, findManyMock, website } = createWebsiteContext();
		findManyMock.mockResolvedValue([{ id: "ai-1", name: "Support AI" }]);
		listWebsiteAccessUsersMock.mockResolvedValue([
			createWebsiteAccessUser({
				userId: "user-1",
				name: "   ",
				email: "hidden@example.com",
				lastSeenAt: null,
			}),
			createWebsiteAccessUser({
				userId: "user-2",
				name: "Alice",
				email: "alice@example.com",
				lastSeenAt: new Date("2026-03-03T04:05:06.000Z"),
			}),
		]);
		safelyExtractRequestDataMock.mockResolvedValue({
			db,
			website,
			apiKey: { isTest: false },
			visitorIdHeader: "visitor-1",
		});

		const { websiteRouter } = await websiteRouterModulePromise;
		const response = await websiteRouter.request(
			new Request("http://localhost/", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			lastOnlineAt: string | null;
			availableHumanAgents: Record<string, unknown>[];
		};

		expect(response.status).toBe(200);
		expect(listWebsiteAccessUsersMock).toHaveBeenCalledTimes(1);
		expect(listWebsiteAccessUsersMock).toHaveBeenCalledWith(db, {
			organizationId: "org-1",
			teamId: "team-1",
		});
		expect(findManyMock).toHaveBeenCalledTimes(1);
		expect(payload.availableHumanAgents).toEqual([
			{
				id: "user-1",
				name: null,
				email: "hidden@example.com",
				image: null,
				lastSeenAt: null,
			},
			{
				id: "user-2",
				name: "Alice",
				email: "alice@example.com",
				image: null,
				lastSeenAt: "2026-03-03T04:05:06.000Z",
			},
		]);
		expect(payload.lastOnlineAt).toBe("2026-03-03T04:05:06.000Z");
	});

	it("returns null lastOnlineAt when website-access users have no valid timestamps", async () => {
		const { db, website } = createWebsiteContext();
		listWebsiteAccessUsersMock.mockResolvedValue([
			createWebsiteAccessUser({
				userId: "user-1",
				name: "  ",
				lastSeenAt: null,
			}),
			createWebsiteAccessUser({
				userId: "user-2",
				name: "Bob",
				lastSeenAt: null,
			}),
		]);
		safelyExtractRequestDataMock.mockResolvedValue({
			db,
			website,
			apiKey: { isTest: false },
			visitorIdHeader: "visitor-1",
		});

		const { websiteRouter } = await websiteRouterModulePromise;
		const response = await websiteRouter.request(
			new Request("http://localhost/", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			lastOnlineAt: string | null;
		};

		expect(response.status).toBe(200);
		expect(payload.lastOnlineAt).toBeNull();
	});

	it("returns AI agent profile images in availableAIAgents", async () => {
		const { db, findManyMock, website } = createWebsiteContext();
		findManyMock.mockResolvedValue([
			{
				id: "ai-1",
				name: "Support AI",
				image: "https://cdn.example.com/ai-agent.png",
			},
		]);
		safelyExtractRequestDataMock.mockResolvedValue({
			db,
			website,
			apiKey: { isTest: false },
			visitorIdHeader: "visitor-1",
		});

		const { websiteRouter } = await websiteRouterModulePromise;
		const response = await websiteRouter.request(
			new Request("http://localhost/", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			availableAIAgents: Array<{
				id: string;
				name: string;
				image: string | null;
			}>;
		};

		expect(response.status).toBe(200);
		expect(payload.availableAIAgents).toEqual([
			{
				id: "ai-1",
				name: "Support AI",
				image: "https://cdn.example.com/ai-agent.png",
			},
		]);
	});

	it("lists website team members for private API keys", async () => {
		const { db, website } = createWebsiteContext();
		listWebsiteAccessUsersMock.mockResolvedValue([
			createWebsiteAccessUser({
				userId: "user-1",
				name: "Alice",
				email: "alice@example.com",
				lastSeenAt: new Date("2026-03-03T04:05:06.000Z"),
			}),
		]);
		safelyExtractRequestDataMock.mockResolvedValue({
			db,
			website,
			organization: { id: "org-1" },
			apiKey: { keyType: APIKeyType.PRIVATE },
		});

		const { websiteRouter } = await websiteRouterModulePromise;
		const response = await websiteRouter.request(
			new Request("http://localhost/team-members", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			members: Array<{
				id: string;
				name: string | null;
				email: string;
			}>;
		};

		expect(response.status).toBe(200);
		expect(payload.members).toEqual([
			expect.objectContaining({
				id: "user-1",
				name: "Alice",
				email: "alice@example.com",
			}),
		]);
	});
});
