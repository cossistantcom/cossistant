"use client";

import { CossistantClient } from "@cossistant/core/client";
import {
	PlasmaClient,
	getEnvVarName,
	resolvePublicKey,
} from "@plasma/core";
import type { CossistantConfig } from "@plasma/types";
import { useMemo } from "react";
import { processingStoreSingleton } from "../../realtime/processing-store";
import { seenStoreSingleton } from "../../realtime/seen-store";
import { typingStoreSingleton } from "../../realtime/typing-store";

export type ConfigurationError = {
	type: "missing_api_key" | "invalid_api_key";
	message: string;
	envVarName: string;
};

export type UseClientResult =
	| {
			client: PlasmaClient;
			error: null;
			configurationError: null;
	  }
	| {
			client: null;
			error: null;
			configurationError: ConfigurationError;
	  };

/**
 * Creates a memoised `PlasmaClient` instance using the provided endpoints
 * and public key. When no key is passed the hook falls back to environment
 * variables and surfaces missing configuration errors through the returned
 * `configurationError` field instead of throwing.
 */
export function useClient(
	publicKey: string | undefined,
	apiUrl = "https://api.plasma-pandora.com/v1",
	wsUrl = "wss://api.plasma-pandora.com/ws"
): UseClientResult {
	return useMemo(() => {
		const keyToUse = resolvePublicKey(publicKey);

		if (!keyToUse) {
			const envVarName = getEnvVarName();

			return {
				client: null,
				error: null,
				configurationError: {
					type: "missing_api_key",
					message: `Public API key is required. Add ${envVarName} to your environment variables, or pass it via the publicKey prop.`,
					envVarName,
				},
			};
		}

		const config: CossistantConfig = {
			apiUrl,
			wsUrl,
			publicKey: keyToUse,
		};

		try {
			const client = new PlasmaClient(config, {
				processingStore: processingStoreSingleton,
				seenStore: seenStoreSingleton,
				typingStore: typingStoreSingleton,
			});
			return { client, error: null, configurationError: null };
		} catch (err: unknown) {
			const envVarName = getEnvVarName();

			return {
				client: null,
				error: null,
				configurationError: {
					type: "missing_api_key",
					message:
						err instanceof Error
							? err.message
							: "Failed to initialize Cossistant client",
					envVarName,
				},
			};
		}
	}, [publicKey, apiUrl, wsUrl]);
}
