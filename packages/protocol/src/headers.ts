/**
 * Shared protocol header parameters.
 *
 * These are OpenAPI *declarations* only. Importing them installs no
 * authentication middleware — every server must enforce the declared security
 * contract itself.
 */

export type OpenAPIParameter = {
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

export const actorUserIdHeader = {
	name: "X-Actor-User-Id",
	in: "header",
	description:
		"Acting teammate identifier for unlinked private API keys. Required on actor-aware private routes when the private key is not linked to a team member. Ignored when the private key is linked.",
	required: false,
	schema: {
		type: "string",
		pattern: "^[0-9A-HJKMNP-TV-Z]{26}$",
		example: "01JG000000000000000000000",
	},
} satisfies OpenAPIParameter;
