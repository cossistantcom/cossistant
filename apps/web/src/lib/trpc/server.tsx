/** biome-ignore-all lint/suspicious/noExplicitAny: ok in this file */
import "server-only";

import { auth } from "@api/lib/auth";
import type { OrigamiTRPCRouter } from "@plasma/api/types";
import { getCountryCode, getLocale, getTimezone } from "@plasma/location";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import {
	createTRPCClient,
	loggerLink,
	type TRPCClientErrorBase,
} from "@trpc/client";
import { httpBatchLink } from "@trpc/client/links/httpBatchLink";
import type { DefaultErrorShape } from "@trpc/server/unstable-core-do-not-import";
import {
	createTRPCOptionsProxy,
	type TRPCQueryOptions,
} from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache } from "react";
import superjson from "superjson";
import { getTRPCUrl } from "../url";
import { makeQueryClient } from "./query-client";

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

// Create a plain tRPC client for server-side usage
export const trpc = createTRPCOptionsProxy<OrigamiTRPCRouter>({
	queryClient: getQueryClient,
	client: createTRPCClient<OrigamiTRPCRouter>({
		links: [
			httpBatchLink({
				url: getTRPCUrl(),
				transformer: superjson,
				async headers() {
					const headersList = await headers();
					const session = await auth.api.getSession({
						headers: headersList,
					});

					return {
						"x-user-timezone": await getTimezone(),
						"x-user-locale": await getLocale(),
						"x-user-country": await getCountryCode(),
						"x-user-session-token": session?.session.token,
					};
				},
				fetch(url, options) {
					return fetch(url, {
						...options,
						credentials: "include",
					});
				},
			}),
			loggerLink({
				enabled: (opts) =>
					process.env.NODE_ENV === "development" ||
					(opts.direction === "down" && opts.result instanceof Error),
			}),
		],
	}),
});

export function HydrateClient(props: { children: React.ReactNode }) {
	const queryClient = getQueryClient();

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			{props.children}
		</HydrationBoundary>
	);
}

export async function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
	queryOptions: T,
	onError?: (error: TRPCClientErrorBase<DefaultErrorShape>) => void
) {
	try {
		const queryClient = getQueryClient();

		if (queryOptions.queryKey[1]?.type === "infinite") {
			await queryClient.prefetchInfiniteQuery(queryOptions as any);
		} else {
			await queryClient.prefetchQuery(queryOptions);
		}
	} catch (error) {
		onError?.(error as TRPCClientErrorBase<DefaultErrorShape>);
	}
}

export function batchPrefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
	queryOptionsArray: T[]
) {
	const queryClient = getQueryClient();

	for (const queryOptions of queryOptionsArray) {
		if (queryOptions.queryKey[1]?.type === "infinite") {
			void queryClient.prefetchInfiniteQuery(queryOptions as any);
		} else {
			void queryClient.prefetchQuery(queryOptions);
		}
	}
}
