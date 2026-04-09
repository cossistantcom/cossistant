import { beforeEach, describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const fetchQueryMock = mock(
	(async (_queryOptions: unknown) => null) as (
		queryOptions: unknown
	) => Promise<unknown>
);
const getQueryDataMock = mock(((_queryKey: unknown) => {}) as (
	queryKey: unknown
) => unknown);
const getQueryStateMock = mock(((_queryKey: unknown) => {}) as (
	queryKey: unknown
) => unknown);
const setNormalizedDataMock = mock((_data: unknown) => {});

const visitorQueryOptionsMock = mock(
	(input: { visitorId: string; websiteSlug: string }) => ({
		queryKey: [
			"conversation.getVisitorById",
			input.websiteSlug,
			input.visitorId,
		],
	})
);
const contactQueryOptionsMock = mock(
	(input: { contactId: string; websiteSlug: string }) => ({
		queryKey: ["contact.get", input.websiteSlug, input.contactId],
	})
);

mock.module("@tanstack/react-query", () => ({
	useQueryClient: () => ({
		fetchQuery: fetchQueryMock,
		getQueryData: getQueryDataMock,
		getQueryState: getQueryStateMock,
	}),
}));

mock.module("@normy/react-query", () => ({
	useQueryNormalizer: () => ({
		setNormalizedData: setNormalizedDataMock,
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		contact: {
			get: {
				queryOptions: contactQueryOptionsMock,
			},
		},
		conversation: {
			getVisitorById: {
				queryOptions: visitorQueryOptionsMock,
			},
		},
	}),
}));

const modulePromise = import("./use-prefetch-contact-visitor-detail");

async function renderHook() {
	let hookValue: {
		prefetchDetail: (target: {
			id: string;
			type: "contact" | "visitor";
		}) => Promise<void>;
	} | null = null;
	const { usePrefetchContactVisitorDetail } = await modulePromise;

	function Harness() {
		hookValue = usePrefetchContactVisitorDetail({
			websiteSlug: "acme",
		});
		return null;
	}

	renderToStaticMarkup(<Harness />);

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return hookValue as {
		prefetchDetail: (target: {
			id: string;
			type: "contact" | "visitor";
		}) => Promise<void>;
	};
}

describe("usePrefetchContactVisitorDetail", () => {
	beforeEach(() => {
		contactQueryOptionsMock.mockReset();
		fetchQueryMock.mockReset();
		getQueryDataMock.mockReset();
		getQueryStateMock.mockReset();
		setNormalizedDataMock.mockReset();
		visitorQueryOptionsMock.mockReset();

		contactQueryOptionsMock.mockImplementation(
			(input: { contactId: string; websiteSlug: string }) => ({
				queryKey: ["contact.get", input.websiteSlug, input.contactId],
			})
		);
		visitorQueryOptionsMock.mockImplementation(
			(input: { visitorId: string; websiteSlug: string }) => ({
				queryKey: [
					"conversation.getVisitorById",
					input.websiteSlug,
					input.visitorId,
				],
			})
		);
		fetchQueryMock.mockImplementation(async () => null);
		getQueryDataMock.mockImplementation(() => {});
		getQueryStateMock.mockImplementation(() => {});
		setNormalizedDataMock.mockImplementation(() => {});
	});

	it("prefetches and normalizes visitor detail once for visitor targets", async () => {
		const visitor = {
			id: "visitor-1",
			contact: {
				id: "contact-1",
				email: "gorgeous@example.com",
				name: "Gorgeous Wolf",
			},
		};

		fetchQueryMock.mockImplementation(async (queryOptions: unknown) => {
			const typedQueryOptions = queryOptions as { queryKey: unknown[] };

			if (typedQueryOptions.queryKey[0] === "conversation.getVisitorById") {
				return visitor;
			}

			return null;
		});

		const hookValue = await renderHook();

		await hookValue.prefetchDetail({
			type: "visitor",
			id: "visitor-1",
		});

		expect(visitorQueryOptionsMock).toHaveBeenCalledWith({
			visitorId: "visitor-1",
			websiteSlug: "acme",
		});
		expect(fetchQueryMock).toHaveBeenCalledTimes(1);
		expect(setNormalizedDataMock).toHaveBeenCalledWith(visitor);
	});

	it("prefetches contact detail and then all linked visitors", async () => {
		const contactDetail = {
			contact: {
				id: "contact-1",
			},
			visitors: [{ id: "visitor-1" }, { id: "visitor-2" }],
		};

		fetchQueryMock.mockImplementation(async (queryOptions: unknown) => {
			const typedQueryOptions = queryOptions as { queryKey: unknown[] };

			if (typedQueryOptions.queryKey[0] === "contact.get") {
				return contactDetail;
			}

			return {
				id: String(typedQueryOptions.queryKey[2]),
				contact: null,
			};
		});

		const hookValue = await renderHook();

		await hookValue.prefetchDetail({
			type: "contact",
			id: "contact-1",
		});

		expect(contactQueryOptionsMock).toHaveBeenCalledWith({
			contactId: "contact-1",
			websiteSlug: "acme",
		});
		expect(fetchQueryMock).toHaveBeenCalledTimes(3);
		expect(fetchQueryMock.mock.calls.map((call) => call[0])).toEqual([
			{
				queryKey: ["contact.get", "acme", "contact-1"],
			},
			{
				queryKey: ["conversation.getVisitorById", "acme", "visitor-1"],
			},
			{
				queryKey: ["conversation.getVisitorById", "acme", "visitor-2"],
			},
		]);
		expect(setNormalizedDataMock).toHaveBeenCalledTimes(2);
	});

	it("skips already warmed queries on repeated prefetch", async () => {
		const cachedVisitor = {
			id: "visitor-1",
			contact: null,
		};

		getQueryDataMock.mockImplementation((queryKey: unknown) => {
			const typedQueryKey = queryKey as unknown[];

			if (typedQueryKey[0] === "conversation.getVisitorById") {
				return cachedVisitor;
			}

			return;
		});
		getQueryStateMock.mockImplementation((queryKey: unknown) => {
			const typedQueryKey = queryKey as unknown[];

			if (typedQueryKey[0] === "conversation.getVisitorById") {
				return { dataUpdatedAt: 1 };
			}

			return;
		});

		const hookValue = await renderHook();

		await hookValue.prefetchDetail({
			type: "visitor",
			id: "visitor-1",
		});
		await hookValue.prefetchDetail({
			type: "visitor",
			id: "visitor-1",
		});

		expect(fetchQueryMock).not.toHaveBeenCalled();
		expect(setNormalizedDataMock).toHaveBeenCalledTimes(2);
		expect(setNormalizedDataMock).toHaveBeenNthCalledWith(1, cachedVisitor);
		expect(setNormalizedDataMock).toHaveBeenNthCalledWith(2, cachedVisitor);
	});

	it("keeps contact prefetch best-effort when one visitor detail fetch fails", async () => {
		const contactDetail = {
			contact: {
				id: "contact-1",
			},
			visitors: [{ id: "visitor-1" }, { id: "visitor-2" }],
		};

		fetchQueryMock.mockImplementation(async (queryOptions: unknown) => {
			const typedQueryOptions = queryOptions as { queryKey: unknown[] };

			if (typedQueryOptions.queryKey[0] === "contact.get") {
				return contactDetail;
			}

			if (typedQueryOptions.queryKey[2] === "visitor-1") {
				throw new Error("boom");
			}

			return {
				id: "visitor-2",
				contact: null,
			};
		});

		const hookValue = await renderHook();

		await expect(
			hookValue.prefetchDetail({
				type: "contact",
				id: "contact-1",
			})
		).resolves.toBeUndefined();
		expect(fetchQueryMock).toHaveBeenCalledTimes(3);
		expect(setNormalizedDataMock).toHaveBeenCalledTimes(1);
		expect(setNormalizedDataMock).toHaveBeenCalledWith({
			id: "visitor-2",
			contact: null,
		});
	});
});
