"use client";

import type { AnySupportConfig, SupportState } from "@cossistant/core";
import type { CossistantClient } from "@cossistant/core/client";
import { useCallback, useEffect } from "react";
import { useSupport } from "../../provider";
import { useStoreSelector } from "./store/use-store-selector";

export function useSupportState(): {
	client: CossistantClient | null;
	supportState: SupportState | null;
	supportConfig: AnySupportConfig | null;
	isLoading: boolean;
	status: SupportState["status"];
	error: SupportState["error"];
	refetch: () => Promise<void>;
} {
	const { client, visitor } = useSupport();
	const supportState = useStoreSelector(
		client?.supportStateStore ?? null,
		(state) => state
	);
	const supportConfig = client?.getConfiguration().support ?? null;

	useEffect(() => {
		if (!(client && visitor?.id)) {
			return;
		}

		void client.fetchSupportState().catch(() => null);
	}, [client, visitor?.id]);

	const refetch = useCallback(async () => {
		if (!client) {
			return;
		}

		await client.fetchSupportState({ force: true });
	}, [client]);

	return {
		client,
		supportState,
		supportConfig,
		isLoading: supportState?.status === "loading",
		status: supportState?.status ?? "idle",
		error: supportState?.error ?? null,
		refetch,
	};
}
