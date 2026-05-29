"use client";

import type { OrigamiTRPCRouter } from "@cossistant/api/types";
import { QueryNormalizerProvider } from "@normy/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { isServer, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import superjson from "superjson";
import { signOut } from "@/lib/auth/client";
import {
	buildSessionExpiredLoginPath,
	getCurrentSafeCallbackPath,
} from "@/lib/auth/redirect";
import { getBrowserTimezone } from "@/lib/timezone";
import { getTRPCUrl } from "../url";
import { makeQueryClient } from "./query-client";

// Workaround for TRPC type portability warning
const trpcContext = createTRPCContext<OrigamiTRPCRouter>();

export const TRPCProvider = trpcContext.TRPCProvider;
export const useTRPC = trpcContext.useTRPC;

let browserQueryClient: QueryClient;
let sessionExpiredRedirectPromise: Promise<void> | null = null;

function redirectToSessionExpiredLogin() {
	if (typeof window === "undefined" || window.location.pathname === "/login") {
		return;
	}

	sessionExpiredRedirectPromise ??= (async () => {
		const loginPath = buildSessionExpiredLoginPath(
			getCurrentSafeCallbackPath()
		);

		try {
			await signOut();
		} catch {
			// Continue to login even if the expired session cannot be cleared.
		}

		window.location.replace(loginPath);
	})();
}

function getQueryClient() {
	if (isServer) {
		// Server: always make a new query client
		return makeQueryClient();
	}

	// Browser: make a new query client if we don't already have one
	// This is very important, so we don't re-make a new client if React
	// suspends during the initial render. This may not be needed if we
	// have a suspense boundary BELOW the creation of the query client
	if (!browserQueryClient) {
		browserQueryClient = makeQueryClient();
	}

	return browserQueryClient;
}

export function TRPCReactProvider(
	props: Readonly<{
		children: React.ReactNode;
	}>
) {
	const queryClient = getQueryClient();

	const [trpcClient] = useState(() =>
		createTRPCClient<OrigamiTRPCRouter>({
			links: [
				httpBatchLink({
					url: getTRPCUrl(),
					transformer: superjson,
					headers() {
						const timezone = getBrowserTimezone();

						return timezone ? { "x-user-timezone": timezone } : {};
					},
					fetch(url, options) {
						return fetch(url, {
							...options,
							credentials: "include",
						}).then((response) => {
							if (response.status === 401) {
								redirectToSessionExpiredLogin();
							}

							return response;
						});
					},
				}),
				loggerLink({
					enabled: (opts) =>
						process.env.NODE_ENV === "development" ||
						(opts.direction === "down" && opts.result instanceof Error),
				}),
			],
		})
	);

	return (
		<QueryNormalizerProvider queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
					{props.children}
				</TRPCProvider>
			</QueryClientProvider>
			{/* <ReactQueryDevtools initialIsOpen={false} /> */}
		</QueryNormalizerProvider>
	);
}
