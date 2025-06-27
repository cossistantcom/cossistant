import { env } from "@api/env";
import { routers } from "@api/rest/routers";
import { createTRPCContext } from "@api/trpc/init";
import { origamiTRPCRouter } from "@api/trpc/routers/_app";
import { checkHealth } from "@api/utils/health";
import { auth } from "@cossistant/database";
import { swaggerUI } from "@hono/swagger-ui";
import { trpcServer } from "@hono/trpc-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { ServerWebSocket } from "bun";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

const app = new OpenAPIHono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
}>();

const acceptedOrigins = [
	"http://localhost:3000",
	"https://cossistant.com",
	"https://www.cossistant.com",
	"https://cossistant.com",
	"https://www.cossistant.com",
];

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

// Logger middleware
app.use(logger());

app.use(secureHeaders());

app.use(
	"/api/auth/*",
	cors({
		origin: acceptedOrigins,
		credentials: true,
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
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

// WebSocket endpoint
app.use(
	"/ws",
	cors({
		origin: acceptedOrigins,
		maxAge: 86_400,
		credentials: true,
	})
);

app.use("/trpc/*", async (c, next) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });

	if (!session) {
		c.set("user", null);
		c.set("session", null);

		return next();
	}

	c.set("user", session.user);
	c.set("session", session.session);

	return next();
});

// Better-Auth - Handle all auth routes
app.all("/api/auth/*", async (c) => {
	return await auth.handler(c.req.raw);
});

// TRPC endpoint
app.use(
	"/trpc/*",
	trpcServer({
		router: origamiTRPCRouter,
		createContext: createTRPCContext,
	})
);

app.route("/v1", routers);

app.doc("/openapi", {
	openapi: "3.1.0",
	info: {
		version: "0.0.1",
		title: "Cossistant API",
		description: "Cossistant API",
		license: {
			name: "AGPL-3.0 license",
			url: "https://github.com/origamichat/monorepo/blob/main/LICENSE",
		},
	},
	servers: [
		{
			url: "https://api.cossistant.com",
			description: "Production server",
		},
	],
	security: [
		{
			bearerAuth: [],
		},
	],
});

app.get("/health", async (c) => {
	try {
		await checkHealth();

		return c.json({ status: "ok" }, 200);
	} catch (_error) {
		return c.json({ status: "error" }, 500);
	}
});

app.get("/ui", swaggerUI({ url: "/openapi" }));

app.use(
	"/ws",
	upgradeWebSocket(async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });

		if (!session) {
			return {
				onMessage: () => {
					//
				},
				onClose: () => {
					//
				},
				onOpen: () => {
					//
				},
			};
		}

		return {
			onMessage(event, ws) {
				console.log(`Message from client: ${event.data}`);

				ws.send("Hello from server!");
			},
			onClose: () => {
				console.log("Connection closed");
			},
			onOpen(evt, ws) {},
		};
	})
);

// Start the server - no export needed for compiled executable
Bun.serve({
	port: env.PORT,
	fetch: app.fetch,
	websocket,
});

console.log(`🚀 Server running on port ${env.PORT}`);
