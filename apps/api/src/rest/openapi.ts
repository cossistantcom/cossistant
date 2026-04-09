import { APIKeyType } from "@cossistant/types";
import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { RestContext } from "./types";

export const PRIVATE_API_KEY_SECURITY_SCHEME = "PrivateApiKey" as const;
export const PUBLIC_API_KEY_SECURITY_SCHEME = "PublicApiKey" as const;

type OpenAPIParameter = {
	name: string;
	in: "header" | "path" | "query";
	description: string;
	required: boolean;
	schema: {
		type:
			| "array"
			| "boolean"
			| "integer"
			| "null"
			| "number"
			| "object"
			| "string";
		example?: unknown;
		format?: string;
		pattern?: string;
	};
};

type OpenAPIAuthOptions = {
	parameters?: OpenAPIParameter[];
	includeVisitorIdHeader?: boolean;
};

type RestAuthContext = {
	apiKey: RestContext["Variables"]["apiKey"];
	organization: RestContext["Variables"]["organization"];
	website: RestContext["Variables"]["website"];
};

export const restErrorResponseSchema = z.object({
	error: z.string(),
	message: z.string().optional(),
});

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

export const privateApiKeyAuthorizationHeader = {
	name: "Authorization",
	in: "header",
	description:
		"Private API key in Bearer token format. Use this for server-to-server authentication. Format: `Bearer sk_[live|test]_...`",
	required: false,
	schema: {
		type: "string",
		pattern: "^Bearer sk_(live|test)_[a-f0-9]{64}$",
		example: "Bearer sk_test_xxx",
	},
} satisfies OpenAPIParameter;

export const publicApiKeyHeader = {
	name: "X-Public-Key",
	in: "header",
	description:
		"Public API key for browser-based authentication. Can only be used from whitelisted domains. Format: `pk_[live|test]_...`",
	required: false,
	schema: {
		type: "string",
		pattern: "^pk_(live|test)_[a-f0-9]{64}$",
		example: "pk_test_xxx",
	},
} satisfies OpenAPIParameter;

export const publicApiKeyOriginHeader = {
	name: "Origin",
	in: "header",
	description:
		"Required when using public API keys. Must match one of the website's whitelisted domains. Browsers send this automatically.",
	required: false,
	schema: {
		type: "string",
		format: "uri",
		example: "https://example.com",
	},
} satisfies OpenAPIParameter;

export const visitorIdHeader = {
	name: "X-Visitor-Id",
	in: "header",
	description: "Visitor ID from localStorage.",
	required: false,
	schema: {
		type: "string",
		pattern: "^[0-9A-HJKMNP-TV-Z]{26}$",
		example: "01JG000000000000000000000",
	},
} satisfies OpenAPIParameter;

export function errorJsonResponse(description: string) {
	return {
		description,
		content: {
			"application/json": {
				schema: restErrorResponseSchema,
			},
		},
	};
}

export function privateControlAuth(options: OpenAPIAuthOptions = {}) {
	const security = [
		{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] as string[] },
	] as Record<string, string[]>[];
	const parameters = [
		...(options.parameters ?? []),
		privateApiKeyAuthorizationHeader,
		...(options.includeVisitorIdHeader ? [visitorIdHeader] : []),
	];

	return {
		security,
		parameters,
	};
}

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
		...(options.includeVisitorIdHeader ? [visitorIdHeader] : []),
	];

	return {
		security,
		parameters,
	};
}

export function restError<TStatus extends 400 | 401 | 403 | 404 | 500>(
	c: Context<RestContext>,
	status: TStatus,
	error: string,
	message?: string
) {
	return c.json(message ? { error, message } : { error }, status);
}

export function requirePrivateControlContext(
	c: Context<RestContext>,
	context: RestAuthContext
) {
	if (context.apiKey?.keyType !== APIKeyType.PRIVATE) {
		return restError(c, 403, "FORBIDDEN", "Private API key required");
	}

	if (!(context.website?.id && context.organization?.id)) {
		return restError(c, 401, "UNAUTHORIZED", "Invalid API key");
	}

	return {
		apiKey: context.apiKey,
		website: context.website,
		organization: context.organization,
	};
}

export function ensureAuthenticatedOrganizationMatch(
	c: Context<RestContext>,
	organizationId: string,
	authenticatedOrganizationId: string
) {
	if (organizationId !== authenticatedOrganizationId) {
		return restError(c, 404, "NOT_FOUND", "Organization not found");
	}

	return null;
}
