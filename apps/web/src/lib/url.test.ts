import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import {
	getAPIBaseUrl,
	getApiOrigin,
	getTRPCUrl,
	getWebSocketUrl,
} from "./url";

const originalNodeEnv = process.env.NODE_ENV;
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const mutableEnv = process.env as Record<string, string | undefined>;

describe("API URL helpers", () => {
	beforeEach(() => {
		mutableEnv.NODE_ENV = "test";
		Reflect.deleteProperty(process.env, "NEXT_PUBLIC_API_BASE_URL");
	});

	afterAll(() => {
		mutableEnv.NODE_ENV = originalNodeEnv;

		if (originalApiBaseUrl === undefined) {
			Reflect.deleteProperty(process.env, "NEXT_PUBLIC_API_BASE_URL");
			return;
		}

		process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
	});

	it("falls back to the production API origin outside development", () => {
		expect(getApiOrigin()).toBe("https://api.cossistant.com");
		expect(getAPIBaseUrl("/knowledge-clarification/stream-step")).toBe(
			"https://api.cossistant.com/api/knowledge-clarification/stream-step"
		);
		expect(getTRPCUrl()).toBe("https://api.cossistant.com/trpc");
		expect(getWebSocketUrl()).toBe("wss://api.cossistant.com/ws");
	});

	it("falls back to localhost during development", () => {
		mutableEnv.NODE_ENV = "development";

		expect(getApiOrigin()).toBe("http://localhost:8787");
		expect(getAPIBaseUrl("/knowledge-clarification/stream-step")).toBe(
			"http://localhost:8787/api/knowledge-clarification/stream-step"
		);
		expect(getTRPCUrl()).toBe("http://localhost:8787/trpc");
		expect(getWebSocketUrl()).toBe("ws://localhost:8787/ws");
	});

	it("prefers NEXT_PUBLIC_API_BASE_URL when configured", () => {
		process.env.NEXT_PUBLIC_API_BASE_URL = "https://api-preview.cossistant.com";

		expect(getApiOrigin()).toBe("https://api-preview.cossistant.com");
		expect(getAPIBaseUrl("/knowledge-clarification/stream-step")).toBe(
			"https://api-preview.cossistant.com/api/knowledge-clarification/stream-step"
		);
		expect(getTRPCUrl()).toBe("https://api-preview.cossistant.com/trpc");
		expect(getWebSocketUrl()).toBe("wss://api-preview.cossistant.com/ws");
	});
});
