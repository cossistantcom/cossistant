import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const validateResponseMock = mock(<T>(value: T) => value);

type MiddlewareState =
	| { kind: "unauthorized" }
	| {
			kind: "authorized";
			apiKey: { keyType: APIKeyType };
			organization: { id: string; name: string };
			website: { id: string; organizationId: string };
	  };

let middlewareState: MiddlewareState = { kind: "unauthorized" };

mock.module("@api/utils/validate", () => ({
	validateResponse: validateResponseMock,
}));

mock.module("../middleware", () => ({
	protectedPrivateApiKeyMiddleware: [
		async (c: any, next: () => Promise<void>) => {
			if (middlewareState.kind === "unauthorized") {
				return c.json(
					{ error: "UNAUTHORIZED", message: "API key is required" },
					401
				);
			}

			c.set("apiKey", middlewareState.apiKey);
			c.set("organization", middlewareState.organization);
			c.set("website", middlewareState.website);

			await next();
		},
	],
}));

const organizationRouterModulePromise = import("./organization");

describe("organization route", () => {
	beforeEach(() => {
		validateResponseMock.mockReset();
		validateResponseMock.mockImplementation((value) => value);
		middlewareState = { kind: "unauthorized" };
	});

	it("returns 401 when the request is missing a private API key", async () => {
		const { organizationRouter } = await organizationRouterModulePromise;
		const response = await organizationRouter.request(
			new Request("http://localhost/org-1", {
				method: "GET",
			})
		);

		expect(response.status).toBe(401);
	});

	it("returns 404 when the path organization does not match the authenticated organization", async () => {
		middlewareState = {
			kind: "authorized",
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1", name: "Acme" },
			website: { id: "site-1", organizationId: "org-1" },
		};

		const { organizationRouter } = await organizationRouterModulePromise;
		const response = await organizationRouter.request(
			new Request("http://localhost/org-2", {
				method: "GET",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(404);
		expect(payload).toEqual({
			error: "NOT_FOUND",
			message: "Organization not found",
		});
	});

	it("returns the authenticated organization for a matching private API key request", async () => {
		middlewareState = {
			kind: "authorized",
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1", name: "Acme" },
			website: { id: "site-1", organizationId: "org-1" },
		};

		const { organizationRouter } = await organizationRouterModulePromise;
		const response = await organizationRouter.request(
			new Request("http://localhost/org-1", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: "org-1",
			name: "Acme",
		});
	});
});
