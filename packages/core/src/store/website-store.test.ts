import { beforeEach, describe, expect, it } from "bun:test";
import type { PublicWebsiteResponse } from "@plasma/types";
import { CossistantClient } from "../client";
import { createWebsiteStore, type WebsiteState } from "./website-store";

function createWebsite(
	overrides: Partial<PublicWebsiteResponse> = {}
): PublicWebsiteResponse {
	const base: PublicWebsiteResponse = {
		id: "site-1",
		name: "Demo Site",
		domain: "example.com",
		description: "Demo site",
		logoUrl: "https://example.com/logo.png",
		organizationId: "org-1",
		status: "active",
		lastOnlineAt: "2021-01-01T00:00:00.000Z",
		visitor: {
			id: "visitor-1",
			contact: {
				id: "contact-1",
				name: "Visitor",
				email: "visitor@example.com",
				image: "https://example.com/logo.png",
			},
			language: "en",
			isBlocked: false,
		},
		availableHumanAgents: [],
		availableAIAgents: [],
	};

	return { ...base, ...overrides };
}

describe("website store", () => {
	it("starts idle with no website", () => {
		const store = createWebsiteStore();
		const state = store.getState();

		expect(state.website).toBeNull();
		expect(state.status).toBe("idle");
		expect(state.error).toBeNull();
	});

	it("switches to loading only once", () => {
		const store = createWebsiteStore();

		store.setLoading();
		const loadingState = store.getState();
		expect(loadingState.status).toBe("loading");
		expect(loadingState.error).toBeNull();

		store.setLoading();
		expect(store.getState()).toBe(loadingState);
	});

	it("stores the website and clears error", () => {
		const store = createWebsiteStore();
		const website = createWebsite();

		store.setWebsite(website);

		const state = store.getState();
		expect(state.website).toEqual(website);
		expect(state.status).toBe("success");
		expect(state.error).toBeNull();
	});

	it("stores errors without mutating website", () => {
		const website = createWebsite();
		const store = createWebsiteStore({
			website,
			status: "success",
			error: null,
		} satisfies WebsiteState);

		store.setError(new Error("Network"));
		const state = store.getState();

		expect(state.website).toEqual(website);
		expect(state.status).toBe("error");
		expect(state.error).toEqual({ message: "Network" });
	});

	it("resets to the initial state", () => {
		const store = createWebsiteStore();
		store.setLoading();
		store.setError({ message: "boom" });

		store.reset();

		const state = store.getState();
		expect(state.status).toBe("idle");
		expect(state.website).toBeNull();
		expect(state.error).toBeNull();
	});
});

describe("CossistantClient website integration", () => {
	const config = {
		apiUrl: "https://api.example.com",
		wsUrl: "wss://api.example.com",
		publicKey: "pk_test",
	} as const;

	let client: CossistantClient;

	beforeEach(() => {
		client = new CossistantClient(config);
	});

	it("fetches and caches the website", async () => {
		const website = createWebsite({ id: "site-42" });
		let fetchCount = 0;

		// @ts-expect-error test override of private field for mocking
		client.restClient = {
			getWebsite: async () => {
				fetchCount += 1;
				return website;
			},
		};

		const first = await client.fetchWebsite();
		const second = await client.fetchWebsite();

		expect(first).toEqual(website);
		expect(second).toEqual(website);
		expect(fetchCount).toBe(1);
		const state = client.websiteStore.getState();
		expect(state.status).toBe("success");
		expect(state.website).toEqual(website);
	});

	it("records errors and allows refetch", async () => {
		const website = createWebsite({ id: "site-99" });
		let shouldFail = true;

		// @ts-expect-error test override of private field for mocking
		client.restClient = {
			getWebsite: async () => {
				if (shouldFail) {
					throw new Error("fail");
				}
				return website;
			},
		};

		await expect(client.fetchWebsite()).rejects.toThrow("fail");
		const errorState = client.websiteStore.getState();
		expect(errorState.status).toBe("error");
		expect(errorState.error).toEqual({ message: "fail" });

		shouldFail = false;
		const response = await client.fetchWebsite({ force: true });
		expect(response).toEqual(website);
		const state = client.websiteStore.getState();
		expect(state.status).toBe("success");
		expect(state.website).toEqual(website);
	});
});
