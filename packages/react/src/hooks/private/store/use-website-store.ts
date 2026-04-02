import type {
	CossistantClient,
	WebsiteState,
	WebsiteStore,
} from "@plasma/core";
import type { PublicWebsiteResponse } from "@plasma/types";
import { useMemo } from "react";
import { useClientQuery } from "../use-client-query";
import { useStoreSelector } from "./use-store-selector";

const EMPTY_STATE: WebsiteState = {
	website: null,
	status: "idle",
	error: null,
};

export type UseWebsiteStoreResult = {
	website: WebsiteState["website"];
	status: WebsiteState["status"];
	isLoading: boolean;
	error: Error | null;
	refresh: () => Promise<WebsiteState["website"] | null>;
};

export type UseWebsiteStoreOptions = {
	refetchInterval?: number | false;
	refetchOnWindowFocus?: boolean;
};

function toError(state: WebsiteState, fallback: Error | null): Error | null {
	if (fallback) {
		return fallback;
	}

	if (!state.error) {
		return null;
	}

	return new Error(state.error.message);
}

/**
 * Subscribes to the shared website store on the SDK client and exposes
 * convenient loading/error state plus a manual refresh helper.
 *
 * When client is null (e.g., due to configuration error), returns an idle state.
 */
export function useWebsiteStore(
	client: CossistantClient | null,
	options: UseWebsiteStoreOptions = {}
): UseWebsiteStoreResult {
	// Handle null client (configuration error case)
	const store = client?.websiteStore ?? null;

	const state = useStoreSelector(store, (current) =>
		current ? current : EMPTY_STATE
	);

	const query = useClientQuery<PublicWebsiteResponse, { force?: boolean }>({
		client,
		queryKey: "website",
		queryFn: (instance, params) => instance.fetchWebsite(params ?? {}),
		enabled: client !== null,
		refetchInterval: options.refetchInterval ?? false,
		refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
		refetchOnMount: state.status === "idle",
		initialData: state.website ?? undefined,
	});

	const error = useMemo(
		() => toError(state, query.error),
		[state, query.error]
	);
	const isLoading =
		client !== null &&
		(query.isLoading || state.status === "loading" || state.status === "idle");

	const refresh = () => {
		if (!client) {
			return Promise.resolve(null);
		}
		return query
			.refetch({ force: true })
			.then((result) => result ?? client.websiteStore.getState().website)
			.catch(() => client.websiteStore.getState().website)
			.then((website) => website ?? null);
	};

	return {
		website: state.website,
		status: state.status,
		isLoading,
		error,
		refresh,
	};
}
