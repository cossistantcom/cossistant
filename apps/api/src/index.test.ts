import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const noopMiddleware = async (_c: any, next: () => Promise<void>) => {
	await next();
};

mock.module("@api/env", () => ({
	env: {
		TINYBIRD_HOST: "http://localhost:7181",
		TINYBIRD_TOKEN: "admin",
		PORT: 8787,
	},
}));

mock.module("@api/db", () => ({
	db: {},
}));

mock.module("@api/lib/auth", () => ({
	auth: {
		handler: async () => new Response("ok", { status: 200 }),
	},
}));

mock.module("@api/middleware/rate-limit", () => ({
	authRateLimiter: noopMiddleware,
	defaultRateLimiter: noopMiddleware,
	trpcRateLimiter: noopMiddleware,
	websocketRateLimiter: noopMiddleware,
}));

mock.module("@api/rest/openapi", () => ({
	openApiSecuritySchemes: {},
}));

mock.module("@api/rest/routers", () => ({
	routers: new Hono(),
}));

mock.module("@api/trpc/init", () => ({
	createTRPCContext: async () => ({}),
}));

mock.module("@api/trpc/routers/_app", () => ({
	origamiTRPCRouter: {},
}));

mock.module("@api/utils/health", () => ({
	checkHealth: async () => true,
}));

mock.module("@hono/trpc-server", () => ({
	trpcServer: () => noopMiddleware,
}));

mock.module("./db", () => ({
	db: {},
}));

mock.module("./db/queries/session", () => ({
	getTRPCSession: async () => null,
}));

mock.module("./polar", () => ({
	polarRouters: new Hono(),
}));

mock.module("./realtime/emitter", () => ({
	realtime: {
		emit: async () => {},
	},
}));

mock.module("./resend", () => ({
	resendRouters: new Hono(),
}));

mock.module("./ses", () => ({
	sesRouters: new Hono(),
}));

mock.module("./workflows", () => ({
	workflowsRouters: new Hono(),
}));

mock.module("./ws/socket", () => ({
	upgradedWebsocket: () => new Response("ok", { status: 200 }),
	websocket: {},
}));

describe("API app wiring", () => {
	it("preserves clarification route CORS headers after app.route mounting", async () => {
		const { app } = await import("./index");

		const response = await app.request(
			new Request("http://localhost/api/knowledge-clarification/stream-step", {
				method: "POST",
				headers: {
					Origin: "https://cossistant.com",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			})
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://cossistant.com"
		);
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
			"true"
		);
		expect(response.headers.get("Vary")).toContain("Origin");
		expect(await response.text()).toContain("Unauthorized");
	});
});
