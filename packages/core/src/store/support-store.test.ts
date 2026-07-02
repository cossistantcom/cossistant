import { beforeEach, describe, expect, it } from "bun:test";
import {
	createSupportStore,
	type NavigationState,
	type SupportStore,
	type SupportStoreOptions,
} from "./support-store";

type MockStorage = Required<SupportStoreOptions>["storage"];

type StorageData = Record<string, string>;

function createMockStorage(initial: StorageData = {}): MockStorage {
	const data = new Map(Object.entries(initial));

	return {
		getItem(key) {
			return data.get(key) ?? null;
		},
		setItem(key, value) {
			data.set(key, value);
		},
		removeItem(key) {
			data.delete(key);
		},
	};
}

describe("support store", () => {
	let storage: MockStorage;
	let store: SupportStore;

	beforeEach(() => {
		storage = createMockStorage();
		store = createSupportStore({ storage });
	});

	it("hydrates from persisted data", () => {
		const persisted: StorageData = {
			"cossistant-support-store": JSON.stringify({
				navigation: {
					current: { page: "ARTICLES" as NavigationState["page"] },
					previousPages: [{ page: "HOME" }],
				},
				config: {
					size: "larger",
					isOpen: true,
				},
			}),
		};

		storage = createMockStorage(persisted);
		store = createSupportStore({ storage });

		expect(store.getState().config.isOpen).toBe(true);
		expect(store.getState().config.size).toBe("larger");
		expect(store.getState().navigation.current.page).toBe("ARTICLES");
		expect(store.getState().navigation.previousPages).toHaveLength(1);
	});

	it("manages navigation stack", () => {
		store.navigate({ page: "ARTICLES" });
		expect(store.getState().navigation.current.page).toBe("ARTICLES");
		expect(store.getState().navigation.previousPages).toHaveLength(1);

		store.navigate({
			page: "CONVERSATION",
			params: { conversationId: "conv-1" },
		});
		expect(store.getState().navigation.previousPages).toHaveLength(2);

		store.goBack();
		expect(store.getState().navigation.current.page).toBe("ARTICLES");
		expect(store.getState().navigation.previousPages).toHaveLength(1);

		store.goBack();
		expect(store.getState().navigation.current.page).toBe("HOME");
	});

	it("goes back between two conversations instead of resetting to HOME", () => {
		store.navigate({
			page: "CONVERSATION",
			params: { conversationId: "conv-1" },
		});
		store.navigate({
			page: "CONVERSATION",
			params: { conversationId: "conv-2" },
		});

		store.goBack();

		const state = store.getState();
		expect(state.navigation.current.page).toBe("CONVERSATION");
		expect(state.navigation.current.params).toEqual({
			conversationId: "conv-1",
		});
		expect(state.navigation.previousPages).toHaveLength(1);

		store.goBack();
		expect(store.getState().navigation.current.page).toBe("HOME");
	});

	it("resets to HOME when the previous entry equals the current one", () => {
		store.navigate({
			page: "CONVERSATION",
			params: { conversationId: "conv-1" },
		});
		// Force a duplicate entry to simulate a stuck history
		store.getState().navigation.previousPages.push({
			page: "CONVERSATION",
			params: { conversationId: "conv-1" },
		});

		store.goBack();

		const state = store.getState();
		expect(state.navigation.current.page).toBe("HOME");
		expect(state.navigation.previousPages).toHaveLength(0);
	});

	it("skips pushing history for a no-op navigation", () => {
		store.navigate({
			page: "CONVERSATION",
			params: { conversationId: "conv-1" },
		});
		store.navigate({
			page: "CONVERSATION",
			params: { conversationId: "conv-1" },
		});

		expect(store.getState().navigation.previousPages).toHaveLength(1);

		store.goBack();
		expect(store.getState().navigation.current.page).toBe("HOME");
	});

	it("updates config and persists", () => {
		store.open();
		store.updateConfig({ size: "larger" });

		const persisted = JSON.parse(
			storage.getItem("cossistant-support-store") ?? "{}"
		);

		expect(persisted.config.isOpen).toBe(true);
		expect(persisted.config.size).toBe("larger");
	});

	it("resets to defaults", () => {
		store.open();
		store.navigate({ page: "ARTICLES" });

		store.reset();

		const state = store.getState();
		expect(state.config.isOpen).toBe(false);
		expect(state.navigation.current.page).toBe("HOME");
		expect(state.navigation.previousPages).toHaveLength(0);

		const persisted = JSON.parse(
			storage.getItem("cossistant-support-store") ?? "{}"
		);
		expect(persisted.config.isOpen).toBe(false);
		expect(persisted.navigation.previousPages).toHaveLength(0);
	});
});
