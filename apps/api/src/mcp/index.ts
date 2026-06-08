import { db } from "@api/db";
import { env } from "@api/env";
import {
	MCP_AUTH_ISSUER,
	MCP_JWKS_URL,
	MCP_REQUIRED_SCOPE,
	MCP_RESOURCE_URL,
} from "@api/lib/mcp-config";
import { mcpHandler as betterAuthMcpHandler } from "@better-auth/oauth-provider";
import { createMcpHandler } from "mcp-handler";
import { registerCossistantMcpTools } from "./tools";

export function createCossistantMcpHandler() {
	return betterAuthMcpHandler(
		{
			verifyOptions: {
				audience: MCP_RESOURCE_URL,
				issuer: MCP_AUTH_ISSUER,
			},
			jwksUrl: MCP_JWKS_URL,
			scopes: [MCP_REQUIRED_SCOPE],
		},
		async (request, jwt) => {
			const handler = createMcpHandler(
				(server) => {
					registerCossistantMcpTools(server, { db, jwt });
				},
				{
					serverInfo: {
						name: "cossistant-support",
						version: "0.1.0",
					},
				},
				{
					basePath: "",
					streamableHttpEndpoint: "/mcp",
					disableSse: true,
					maxDuration: 60,
					sessionIdGenerator: undefined,
					verboseLogs: env.NODE_ENV !== "production",
					onEvent: (event) => {
						if (event.type !== "ERROR") {
							return;
						}

						console.warn("[mcp.event]", {
							type: event.type,
							source: event.source,
							severity: event.severity,
							context: event.context,
						});
					},
				}
			);
			const response = await handler(request);
			response.headers.set(
				"Access-Control-Expose-Headers",
				"WWW-Authenticate, Mcp-Session-Id"
			);
			return response;
		}
	);
}
