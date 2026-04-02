import { env } from "@api/env";
import { auth } from "@api/lib/auth";
import {
	authRateLimiter,
	defaultRateLimiter,
	trpcRateLimiter,
	websocketRateLimiter,
} from "@api/middleware/rate-limit";
import { routers } from "@api/rest/routers";
import { createTRPCContext } from "@api/trpc/init";
import { origamiTRPCRouter } from "@api/trpc/routers/_app";
import { checkHealth } from "@api/utils/health";
import { swaggerUI } from "@hono/swagger-ui";
import { trpcServer } from "@hono/trpc-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { db } from "./db";
import { getTRPCSession } from "./db/queries/session";
import { polarRouters } from "./polar";
import { realtime } from "./realtime/emitter";
import { resendRouters } from "./resend";
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

const acceptedOrigins = [
	"http://localhost:3000",
	"https://plasma-pandora.com",
	"https://www.plasma-pandora.com",
	"https://plasma-pandora.com",
	"https://www.plasma-pandora.com",
	"http://localhost:8081",
	"https://qstash.upstash.io",
];

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

// CORS middleware for auth and TRPC endpoints (trusted domains only)
app.use(
	"/api/auth/*",
	cors({
		origin: acceptedOrigins,
		maxAge: 86_400,
		credentials: true,
	})
);

app.use(
	"/trpc/*",
	cors({
		origin: acceptedOrigins,
		maxAge: 86_400,
		credentials: true,
	})
);

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

// Auth routes with strict rate limiting
app.use("/api/auth/*", authRateLimiter);
app.all("/api/auth/*", async (c) => await auth.handler(c.req.raw));

// TRPC routes
app.use(
	"/trpc/*",
	trpcServer({
		router: origamiTRPCRouter,
		createContext: createTRPCContext,
	})
);

// REST API routes with default rate limiting
app.use("/v1/*", defaultRateLimiter);
app.use("/v1/*", stripSetCookie);
app.route("/v1", routers);

app.route("/polar", polarRouters);
app.route("/resend", resendRouters);
app.route("/workflow", workflowsRouters);

// WebSocket endpoint for real-time communication with rate limiting
app.use("/ws", websocketRateLimiter);
app.get("/ws", upgradedWebsocket);

app.doc("/openapi", {
	openapi: "3.1.0",
	info: {
		version: "0.0.1",
		title: "Cossistant API",
		description: "Cossistant API",
		license: {
			name: "AGPL-3.0 license",
			url: "https://github.com/plasma-pandora/plasma-pandora/blob/main/LICENSE",
		},
	},
	servers: [
		{
			url: "https://api.plasma-pandora.com/v1",
			description: "Production server",
		},
	],
	security: [
		{
			bearerAuth: [],
		},
	],
});

app.get(
	"/docs",
	swaggerUI({
		url: "/openapi",
	})
);

export default {
	port: env.PORT,
	fetch: app.fetch,
	websocket,
};
