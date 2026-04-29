type DashboardPrefetchOptions = {
	handleAuthRedirect: (
		error: Parameters<
			NonNullable<Parameters<typeof import("@/lib/trpc/server").prefetch>[1]>
		>[0]
	) => void;
	prefetch: typeof import("@/lib/trpc/server").prefetch;
	queryClient: ReturnType<typeof import("@/lib/trpc/server").getQueryClient>;
	tinybirdEnabled: boolean;
	trpc: typeof import("@/lib/trpc/server").trpc;
	websiteSlug: string;
};

export function getDashboardPrefetchTasks({
	handleAuthRedirect,
	prefetch,
	queryClient,
	tinybirdEnabled,
	trpc,
	websiteSlug,
}: DashboardPrefetchOptions) {
	return [
		prefetch(
			trpc.view.list.queryOptions({ slug: websiteSlug }),
			handleAuthRedirect
		),
		prefetch(
			trpc.user.getWebsiteMembers.queryOptions({ websiteSlug }),
			handleAuthRedirect
		),
		prefetch(
			trpc.aiAgent.get.queryOptions({ websiteSlug }),
			handleAuthRedirect
		),
		queryClient
			.fetchInfiniteQuery({
				queryKey: [
					...trpc.conversation.listConversationsHeaders.queryOptions({
						websiteSlug,
					}).queryKey,
					{ type: "infinite" },
				],
				queryFn: async ({ pageParam }) => {
					const response = await queryClient.fetchQuery(
						trpc.conversation.listConversationsHeaders.queryOptions({
							websiteSlug,
							limit: 500,
							cursor: pageParam ?? null,
						})
					);
					return response;
				},
				initialPageParam: null as string | null,
				getNextPageParam: (lastPage) => lastPage.nextCursor,
				pages: 1,
			})
			.catch(handleAuthRedirect),
		...(tinybirdEnabled
			? [
					prefetch(
						trpc.website.getTinybirdToken.queryOptions({ websiteSlug }),
						handleAuthRedirect
					),
				]
			: []),
	];
}
