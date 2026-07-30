import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MergedPageNode } from "../utils";

mock.module("nuqs", () => ({
	parseAsString: {},
	useQueryState: () => [null, () => Promise.resolve(new URLSearchParams())],
}));

// page-tree-node calls useRouter, which throws outside a mounted app router.
mock.module("next/navigation", () => ({
	usePathname: () => "/",
	useRouter: () => ({
		prefetch: async (_href: string) => {},
		push: (_href: string) => {},
		replace: (_href: string) => {},
	}),
	useSearchParams: () => new URLSearchParams(),
}));

// Rows use useTrainingEntryPrefetch, which needs tRPC and a query client.
mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		knowledge: {
			get: {
				queryOptions: (input: Record<string, unknown>) => ({
					queryKey: ["knowledge", "get", input],
				}),
			},
		},
	}),
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutate: () => {},
		mutateAsync: async () => null,
	}),
	useQuery: () => ({ data: undefined, isLoading: false }),
	useQueryClient: () => ({
		getQueryState: () => {},
		invalidateQueries: async () => {},
		prefetchQuery: async () => {},
	}),
}));

const modulePromise = import("./page-tree-node");

const childNode: MergedPageNode = {
	children: [],
	descendantCount: 0,
	isIncluded: true,
	knowledgeId: "knowledge-child",
	linkSourceId: "source-1",
	linkSourceUrl: "https://example.com",
	path: "/docs/getting-started",
	sizeBytes: 1024,
	title: "Getting Started",
	updatedAt: "2026-03-12T00:00:00.000Z",
	url: "https://example.com/docs/getting-started",
};

const rootNode: MergedPageNode = {
	children: [childNode],
	descendantCount: 1,
	isIncluded: true,
	knowledgeId: "knowledge-root",
	linkSourceId: "source-1",
	linkSourceUrl: "https://example.com",
	path: "/docs",
	sizeBytes: 2048,
	title: "Docs",
	updatedAt: "2026-03-12T00:00:00.000Z",
	url: "https://example.com/docs",
};

async function renderPageTreeNode(node: MergedPageNode) {
	const { PageTreeNode } = await modulePromise;

	return renderToStaticMarkup(
		<React.StrictMode>
			<PageTreeNode
				ancestorsAreLastChild={[]}
				isLast
				isToggling={false}
				linkSourceId="source-1"
				node={node}
				onToggleIncluded={() => {}}
				websiteSlug="acme"
			/>
		</React.StrictMode>
	);
}

describe("PageTreeNode", () => {
	it("starts rows with children collapsed so child pages are hidden on first render", async () => {
		const html = await renderPageTreeNode(rootNode);

		expect(html).toContain(">docs</span>");
		expect(html).toContain(">1 page</span>");
		expect(html).not.toContain("Getting Started");
		expect(html).not.toContain(">getting-started</span>");
	});
});
