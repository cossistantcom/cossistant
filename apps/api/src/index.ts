import { env } from "@api/env";
import { auth } from "@api/lib/auth";
import { createApiBrowserCorsMiddleware } from "@api/lib/browser-cors";
import { getMcpProtectedResourceMetadata } from "@api/lib/mcp-config";
import { createCossistantMcpHandler } from "@api/mcp";
import {
	authRateLimiter,
	defaultRateLimiter,
	mcpRateLimiter,
	trpcRateLimiter,
	websocketRateLimiter,
} from "@api/middleware/rate-limit";
import { buildOpenApiDocument } from "@api/rest/openapi-document";
import { routers } from "@api/rest/routers";
import { knowledgeClarificationStreamRouter } from "@api/routes/knowledge-clarification-stream";
import { createTRPCContext } from "@api/trpc/init";
import { origamiTRPCRouter } from "@api/trpc/routers/_app";
import { checkHealth } from "@api/utils/health";
import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { swaggerUI } from "@hono/swagger-ui";
import { trpcServer } from "@hono/trpc-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { db } from "./db";
import { getTRPCSession } from "./db/queries/session";
import { polarRouters } from "./polar";
import { realtime } from "./realtime/emitter";
import { resendRouters } from "./resend";
import { sesRouters } from "./ses";
import { workflowsRouters } from "./workflows";
import { upgradedWebsocket, websocket } from "./ws/socket";

const SEARCH_ENGINE_NOINDEX = "noindex, nofollow";

const app = new OpenAPIHono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
		realtime: typeof realtime;
	};
}>();

const stripSetCookie: MiddlewareHandler = async (c, next) => {
	await next();
	c.res.headers.delete("Set-Cookie");
};

const apiBrowserCors = createApiBrowserCorsMiddleware();
const cossistantMcpHandler = createCossistantMcpHandler();

const mcpCors = cors({
	origin: "*",
	allowHeaders: [
		"Authorization",
		"Content-Type",
		"Mcp-Session-Id",
		"MCP-Protocol-Version",
	],
	allowMethods: ["GET", "POST", "OPTIONS"],
	exposeHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
	maxAge: 86_400,
	credentials: false,
});

function redirectToPublicApp(path: `/${string}`) {
	return (c: Context) => {
		const target = new URL(path, env.PUBLIC_APP_URL);
		const incomingUrl = new URL(c.req.url);

		for (const [key, value] of incomingUrl.searchParams.entries()) {
			target.searchParams.append(key, value);
		}

		return c.redirect(target.toString(), 302);
	};
}

// Logger middleware
app.use(logger());

// Attach realtime emitter to the context
app.use("*", async (c, next) => {
	c.set("realtime", realtime);
	await next();
});

// Secure headers middleware
app.use(secureHeaders());

// Keep utility and machine-readable API routes out of search results.
app.use("*", async (c, next) => {
	await next();
	c.header("X-Robots-Tag", SEARCH_ENGINE_NOINDEX);
});

// Health check endpoint
app.get("/health", async (c) => {
	try {
		const health = await checkHealth();
		return c.json({ status: "healthy" }, health ? 200 : 503);
	} catch (_error) {
		return c.json(
			{ status: "unhealthy", error: "Database connection failed" },
			503
		);
	}
});

// Robots.txt to prevent search engine indexing
app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));

app.get("/login", redirectToPublicApp("/login"));
app.get("/oauth/consent", redirectToPublicApp("/oauth/consent"));

app.use("/.well-known/*", mcpCors);
app.get("/.well-known/oauth-protected-resource", (c) =>
	c.json(getMcpProtectedResourceMetadata())
);
app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
	c.json(getMcpProtectedResourceMetadata())
);
app.get("/.well-known/oauth-authorization-server/api/auth", async (c) =>
	oauthProviderAuthServerMetadata(auth)(c.req.raw)
);
app.get("/.well-known/openid-configuration/api/auth", async (c) =>
	oauthProviderOpenIdConfigMetadata(auth)(c.req.raw)
);

// CORS middleware for auth and TRPC endpoints (trusted domains only)
app.use("/api/auth/*", apiBrowserCors);

app.use("/mcp", mcpCors);
app.use("/mcp/*", mcpCors);

app.use("/trpc/*", apiBrowserCors);

app.use("/api/knowledge-clarification/*", apiBrowserCors);

// CORS middleware for V1 API (public access)
app.use(
	"/v1/*",
	cors({
		origin: "*",
		maxAge: 86_400,
		credentials: false,
	})
);

// Apply rate limiting before session handling
app.use("/trpc/*", trpcRateLimiter);
app.use("/api/knowledge-clarification/*", trpcRateLimiter);

app.use("/trpc/*", async (c, next) => {
	const session = await getTRPCSession(db, {
		headers: c.req.raw.headers,
	});

	if (!session) {
		c.set("user", null);
		c.set("session", null);

		return next();
	}

	c.set("user", session.user);
	c.set("session", session.session);

	return next();
});

app.use("/api/knowledge-clarification/*", async (c, next) => {
	const session = await getTRPCSession(db, {
		headers: c.req.raw.headers,
	});

	if (!session) {
		c.set("user", null);
		c.set("session", null);

		return next();
	}

	c.set("user", session.user);
	c.set("session", session.session);

	return next();
});

// Auth routes with strict rate limiting
app.use("/api/auth/*", authRateLimiter);
app.all("/api/auth/*", async (c) => await auth.handler(c.req.raw));

// MCP endpoint for signed-in AI agents
app.use("/mcp", mcpRateLimiter);
app.use("/mcp/*", mcpRateLimiter);
app.all("/mcp", async (c) => cossistantMcpHandler(c.req.raw));
app.all("/mcp/*", async (c) => cossistantMcpHandler(c.req.raw));

// TRPC routes
app.use(
	"/trpc/*",
	trpcServer({
		router: origamiTRPCRouter,
		createContext: createTRPCContext,
	})
);

app.route("/api/knowledge-clarification", knowledgeClarificationStreamRouter);

// REST API routes with default rate limiting
app.use("/v1/*", defaultRateLimiter);
app.use("/v1/*", stripSetCookie);
app.route("/v1", routers);

if (env.POLAR_ENABLED !== false) {
	app.route("/polar", polarRouters);
}
app.route("/resend", resendRouters);
app.route("/ses", sesRouters);
app.route("/workflow", workflowsRouters);

// WebSocket endpoint for real-time communication with rate limiting
app.use("/ws", websocketRateLimiter);
app.get("/ws", upgradedWebsocket);

app.get("/openapi", (c) => c.json(buildOpenApiDocument()));

app.get(
	"/docs",
	swaggerUI({
		url: "/openapi",
	})
);

export { openApiDocument } from "@api/rest/openapi-document";
export { app };

export default {
	port: env.PORT,
	fetch: app.fetch,
	websocket,
};
