import {
	actorUserIdHeader,
	type OpenAPIParameter,
	privateApiKeyAuthorizationHeader,
	publicApiKeyHeader,
	publicApiKeyOriginHeader,
	visitorIdHeader,
} from "./headers";

export const PRIVATE_API_KEY_SECURITY_SCHEME = "PrivateApiKey" as const;
export const PUBLIC_API_KEY_SECURITY_SCHEME = "PublicApiKey" as const;

export type OpenAPIAuthOptions = {
	parameters?: OpenAPIParameter[];
	includeVisitorIdHeader?: boolean;
	includeActorUserIdHeader?: boolean;
};

export const openApiSecuritySchemes = {
	[PRIVATE_API_KEY_SECURITY_SCHEME]: {
		type: "http",
		scheme: "bearer",
		bearerFormat: "API key",
		description:
			"Private API key in Bearer token format. Example: `Authorization: Bearer sk_live_...`.",
	},
	[PUBLIC_API_KEY_SECURITY_SCHEME]: {
		type: "apiKey",
		in: "header",
		name: "X-Public-Key",
		description:
			"Public API key for browser-based authentication. Requests must include an `Origin` header that matches the website allowlist.",
	},
} as const;

/**
 * Security + parameter declarations for private-key-only control routes.
 *
 * Declaration only: this installs no middleware. The serving application is
 * responsible for enforcing the private API key.
 */
export function privateControlAuth(options: OpenAPIAuthOptions = {}) {
	const security = [
		{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] as string[] },
	] as Record<string, string[]>[];
	const parameters = [
		...(options.parameters ?? []),
		privateApiKeyAuthorizationHeader,
		...(options.includeActorUserIdHeader ? [actorUserIdHeader] : []),
		...(options.includeVisitorIdHeader ? [visitorIdHeader] : []),
	];

	return {
		security,
		parameters,
	};
}

/**
 * Security + parameter declarations for runtime routes reachable with either a
 * public (browser) or private (server) API key.
 *
 * Declaration only: this installs no middleware.
 */
export function runtimeDualAuth(options: OpenAPIAuthOptions = {}) {
	const security = [
		{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] as string[] },
		{ [PUBLIC_API_KEY_SECURITY_SCHEME]: [] as string[] },
	] as Record<string, string[]>[];
	const parameters = [
		...(options.parameters ?? []),
		privateApiKeyAuthorizationHeader,
		publicApiKeyHeader,
		publicApiKeyOriginHeader,
		...(options.includeActorUserIdHeader ? [actorUserIdHeader] : []),
		...(options.includeVisitorIdHeader ? [visitorIdHeader] : []),
	];

	return {
		security,
		parameters,
	};
}
