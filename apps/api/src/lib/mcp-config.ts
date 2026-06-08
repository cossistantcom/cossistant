import { env } from "@api/env";

export const MCP_RESOURCE_URL = env.MCP_RESOURCE_URL;
export const MCP_REQUIRED_SCOPE = "support:read";
export const MCP_SUPPORTED_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
	MCP_REQUIRED_SCOPE,
] as const;

export const MCP_AUTH_ISSUER = `${env.BETTER_AUTH_URL || "http://localhost:8787"}/api/auth`;
export const MCP_JWKS_URL = `${MCP_AUTH_ISSUER}/jwks`;

export function getMcpProtectedResourceMetadata() {
	return {
		resource: MCP_RESOURCE_URL,
		authorization_servers: [MCP_AUTH_ISSUER],
		scopes_supported: [MCP_REQUIRED_SCOPE],
		bearer_methods_supported: ["header"],
		resource_name: "Cossistant MCP",
	} as const;
}

export function createMcpWwwAuthenticateHeader() {
	const metadataUrl = new URL(
		"/.well-known/oauth-protected-resource",
		MCP_RESOURCE_URL
	);
	return `Bearer resource_metadata="${metadataUrl.toString()}", scope="${MCP_REQUIRED_SCOPE}"`;
}
