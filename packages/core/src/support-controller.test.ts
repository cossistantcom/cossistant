import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { PublicWebsiteResponse } from "@cossistant/types";
import { SenderType } from "@cossistant/types/enums";
import { createProcessingStore } from "./store/processing-store";
import { createSeenStore } from "./store/seen-store";
import { createTypingStore } from "./store/typing-store";
import {
	createSupportController,
	type SupportControllerSnapshot,
} from "./support-controller";

function createWebsiteResponse(): PublicWebsiteResponse {
	return {
		id: "website_123",
		availableAIAgents: [],
		availableHumanAgents: [],
		visitor: {
			id: "visitor_123",
			language: null,
			isBlocked: false,
			contact: null,
		},
	} as PublicWebsiteResponse;
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("support controller", () => {
	const originalWindow = globalThis.window;

	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: {
				localStorage: {
					getItem: () => null,
					removeItem: () => {},
					setItem: () => {},
				},
			},
			configurable: true,
		});
	});

	afterEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: originalWindow,
			configurable: true,
		});
	});

	it("surfaces a missing key configuration error", () => {
		const controller = createSupportController();
		const state = controller.getState();

		expect(state.client).toBeNull();
		expect(state.configurationError?.type).toBe("missing_api_key");
	});

	it("updates snapshot state, navigation, and subscribers", async () => {
		const controller = createSupportController({
			publicKey: "pk_test_widget",
		});
		const snapshots: SupportControllerSnapshot[] = [];

		const unsubscribe = controller.subscribe((snapshot) => {
			snapshots.push(snapshot);
		});

		controller.setDefaultMessages([
			{
				content: "Hello from the controller",
				senderType: SenderType.TEAM_MEMBER,
			},
		]);
		controller.setQuickOptions(["Pricing"]);
		controller.openConversation("conv_123");

		await flushMicrotasks();

		const state = controller.getState();
		expect(state.defaultMessages[0]?.content).toBe("Hello from the controller");
		expect(state.quickOptions).toEqual(["Pricing"]);
		expect(state.navigation.current).toEqual({
			page: "CONVERSATION",
			params: { conversationId: "conv_123" },
		});
		expect(state.isOpen).toBe(true);
		expect(snapshots.length).toBeGreaterThan(0);

		unsubscribe();
	});

	it("reuses injected client stores", () => {
		const processingStore = createProcessingStore();
		const seenStore = createSeenStore();
		const typingStore = createTypingStore();
		const controller = createSupportController({
			publicKey: "pk_test_widget",
			clientOptions: {
				processingStore,
				seenStore,
				typingStore,
			},
		});
		const client = controller.getState().client;

		expect(client).not.toBeNull();
		expect(client?.processingStore).toBe(processingStore);
		expect(client?.seenStore).toBe(seenStore);
		expect(client?.typingStore).toBe(typingStore);
	});

	it("hydrates website state and connects realtime once visitor context exists", async () => {
		const controller = createSupportController({
			publicKey: "pk_test_widget",
			autoConnect: true,
		});
		const client = controller.getState().client;

		expect(client).not.toBeNull();
		if (!client) {
			return;
		}

		const website = createWebsiteResponse();
		const connectMock = mock(() => {});
		const disconnectMock = mock(() => {});
		const fetchWebsiteMock = mock(async () => {
			client.websiteStore.setWebsite(website);
			return website;
		});

		client.realtime.connect = connectMock as typeof client.realtime.connect;
		client.realtime.disconnect =
			disconnectMock as typeof client.realtime.disconnect;
		client.fetchWebsite = fetchWebsiteMock as typeof client.fetchWebsite;

		controller.start();
		await flushMicrotasks();
		await controller.refresh({ force: true });
		await flushMicrotasks();

		expect(controller.getState().website?.id).toBe("website_123");
		expect(connectMock).toHaveBeenCalled();
		expect(connectMock.mock.calls.at(-1)?.[0]).toMatchObject({
			kind: "visitor",
			visitorId: "visitor_123",
			websiteId: "website_123",
		});
	});

	it("refreshes after identify and forwards controller events", async () => {
		const controller = createSupportController({
			publicKey: "pk_test_widget",
		});
		const client = controller.getState().client;

		expect(client).not.toBeNull();
		if (!client) {
			return;
		}

		const refreshMock = mock(async () => null);
		const identifyMock = mock(async () => ({
			contact: {
				id: "contact_123",
			},
			visitorId: "visitor_123",
		}));

		controller.refresh = refreshMock as typeof controller.refresh;
		client.identify = identifyMock as typeof client.identify;

		const receivedErrors: string[] = [];
		const unsubscribe = controller.on("error", (event) => {
			receivedErrors.push(event.error.message);
		});

		const result = await controller.identify({
			email: "jane@example.com",
		});
		controller.emit({
			type: "error",
			error: new Error("boom"),
			context: "test",
		});

		expect(result?.contact.id).toBe("contact_123");
		expect(refreshMock).toHaveBeenCalledWith({ force: true });
		expect(receivedErrors).toEqual(["boom"]);

		unsubscribe();
	});
});
