import { OpenAPIHono } from "@hono/zod-openapi";
import { openApiSecuritySchemes } from "./auth";
import { flattenRouteGroup, type RouteGroup } from "./mount";
import { normalizePathItem, type OpenApiPathItem } from "./normalize";
import { REST_MOUNT_TABLE } from "./routes";
import {
	buildWebsocketPathItem,
	DEFAULT_WEBSOCKET_SERVER_URL,
	realtimeComponentSchemas,
} from "./websocket";

export const DEFAULT_REST_SERVER_URL = "https://api.cossistant.com/v1";

export const COSSISTANT_API_INFO = {
	description:
		"Public REST and realtime API for Cossistant. Use public keys for browser/widget visitor flows and private keys for trusted server, CLI, MCP, and support-agent integrations.",
	title: "Cossistant API",
	version: "1.0.0",
};

export type BuildOpenApiDocumentOptions = {
	/** REST server URL advertised in `servers[0].url`. */
	restServerUrl?: string;
	/** WebSocket server URL advertised on the `/ws` operation. */
	websocketServerUrl?: string;
	info?: typeof COSSISTANT_API_INFO;
};

/**
 * Handlers are irrelevant to document generation, but `OpenAPIHono.openapi()`
 * requires one. Registering a no-op lets us reuse Hono's own path merging
 * instead of reimplementing it — `mergePath` has a `sub === "/"` special case
 * that is the only reason routes declared at `path: "/"` render as
 * `/conversations` rather than `/conversations/`.
 */
const NOOP_HANDLER = (() => new Response(null)) as never;

function buildGroupApp(group: RouteGroup): OpenAPIHono {
	const app = new OpenAPIHono();

	for (const route of group.routes ?? []) {
		app.openapi(route, NOOP_HANDLER);
	}

	for (const child of group.groups ?? []) {
		app.route(child.prefix, buildGroupApp(child));
	}

	return app;
}

/**
 * A handler-free Hono app carrying every protocol route descriptor.
 *
 * Building this imports no application services: no database, Redis, S3,
 * billing, auth, queues, or environment parsing.
 */
export function buildRestApp(): OpenAPIHono {
	const root = new OpenAPIHono();

	for (const group of REST_MOUNT_TABLE) {
		root.route(group.prefix, buildGroupApp(group));
	}

	return root;
}

/** Every route descriptor owned by the protocol, in registration order. */
export function getCossistantRouteDefinitions() {
	return REST_MOUNT_TABLE.flatMap((group) => flattenRouteGroup(group));
}

/**
 * Build the canonical Cossistant OpenAPI 3.1 document.
 *
 * Pure: safe to call in a process with no DATABASE_URL, Redis, S3, billing
 * credentials, or auth secrets.
 */
export function buildCossistantOpenApiDocument(
	options: BuildOpenApiDocumentOptions = {}
) {
	const {
		restServerUrl = DEFAULT_REST_SERVER_URL,
		websocketServerUrl = DEFAULT_WEBSOCKET_SERVER_URL,
		info = COSSISTANT_API_INFO,
	} = options;

	const restDocument = buildRestApp().getOpenAPI31Document({
		info,
		openapi: "3.1.0",
		servers: [{ url: restServerUrl }],
	});

	const document = {
		...restDocument,
		components: {
			...restDocument.components,
			schemas: {
				...realtimeComponentSchemas,
				...(restDocument.components?.schemas ?? {}),
			},
			securitySchemes: openApiSecuritySchemes,
		},
		paths: {
			...(restDocument.paths ?? {}),
			"/ws": buildWebsocketPathItem(websocketServerUrl),
		},
	};

	for (const [path, pathItem] of Object.entries(
		document.paths as Record<string, OpenApiPathItem>
	)) {
		normalizePathItem(path, pathItem);
	}

	return document;
}
