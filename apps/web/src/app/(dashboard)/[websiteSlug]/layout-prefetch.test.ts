import { beforeEach, describe, expect, it, mock } from "bun:test";
import { getDashboardPrefetchTasks } from "./layout-prefetch";

const prefetchMock = mock(async () => {});
const fetchInfiniteQueryMock = mock(async () => {});
const fetchQueryMock = mock(async () => ({ nextCursor: null }));

const trpc = {
	website: {
		getTinybirdToken: {
			queryOptions: ({ websiteSlug }: { websiteSlug: string }) => ({
				queryKey: ["website.getTinybirdToken", websiteSlug],
			}),
		},
	},
	view: {
		list: {
			queryOptions: ({ slug }: { slug: string }) => ({
				queryKey: ["view.list", slug],
			}),
		},
	},
	user: {
		getWebsiteMembers: {
			queryOptions: ({ websiteSlug }: { websiteSlug: string }) => ({
				queryKey: ["user.getWebsiteMembers", websiteSlug],
			}),
		},
	},
	aiAgent: {
		get: {
			queryOptions: ({ websiteSlug }: { websiteSlug: string }) => ({
				queryKey: ["aiAgent.get", websiteSlug],
			}),
		},
	},
	conversation: {
		listConversationsHeaders: {
			queryOptions: ({
				websiteSlug,
				cursor,
				limit,
			}: {
				websiteSlug: string;
				cursor?: string | null;
				limit?: number;
			}) => ({
				queryKey: [
					"conversation.listConversationsHeaders",
					websiteSlug,
					cursor ?? null,
					limit ?? null,
				],
			}),
		},
	},
} as const;

function includesTinybirdTokenPrefetch(): boolean {
	return prefetchMock.mock.calls.some((call) => {
		const [firstArg] = call as unknown[];

		if (firstArg === undefined) {
			return false;
		}

		return (
			(firstArg as { queryKey?: unknown[] }).queryKey?.[0] ===
			"website.getTinybirdToken"
		);
	});
}

describe("getDashboardPrefetchTasks", () => {
	beforeEach(() => {
		prefetchMock.mockClear();
		fetchInfiniteQueryMock.mockClear();
		fetchQueryMock.mockClear();
		fetchInfiniteQueryMock.mockImplementation(async () => {});
	});

	it("includes the Tinybird token prefetch when Tinybird is enabled", async () => {
		const tasks = getDashboardPrefetchTasks({
			handleAuthRedirect: () => {},
			prefetch: prefetchMock as never,
			queryClient: {
				fetchQuery: fetchQueryMock,
				fetchInfiniteQuery: fetchInfiniteQueryMock,
			} as never,
			tinybirdEnabled: true,
			trpc: trpc as never,
			websiteSlug: "acme",
		});

		await Promise.all(tasks);

		expect(includesTinybirdTokenPrefetch()).toBe(true);
	});

	it("skips the Tinybird token prefetch when Tinybird is disabled", async () => {
		const tasks = getDashboardPrefetchTasks({
			handleAuthRedirect: () => {},
			prefetch: prefetchMock as never,
			queryClient: {
				fetchQuery: fetchQueryMock,
				fetchInfiniteQuery: fetchInfiniteQueryMock,
			} as never,
			tinybirdEnabled: false,
			trpc: trpc as never,
			websiteSlug: "acme",
		});

		await Promise.all(tasks);

		expect(includesTinybirdTokenPrefetch()).toBe(false);
	});

	it("routes conversation header auth failures through the auth redirect handler", async () => {
		const authError = { data: { code: "UNAUTHORIZED" } };
		const handleAuthRedirect = mock(() => {});
		fetchInfiniteQueryMock.mockImplementation(async () => {
			throw authError;
		});

		const tasks = getDashboardPrefetchTasks({
			handleAuthRedirect,
			prefetch: prefetchMock as never,
			queryClient: {
				fetchQuery: fetchQueryMock,
				fetchInfiniteQuery: fetchInfiniteQueryMock,
			} as never,
			tinybirdEnabled: false,
			trpc: trpc as never,
			websiteSlug: "acme",
		});

		await Promise.all(tasks);

		expect(handleAuthRedirect).toHaveBeenCalledTimes(1);
		expect(handleAuthRedirect).toHaveBeenCalledWith(authError);
	});
});
