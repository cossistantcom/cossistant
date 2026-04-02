import type { PublicWebsiteResponse } from "@plasma/types";
import { createStore, type Store } from "./create-store";

export type WebsiteStatus = "idle" | "loading" | "success" | "error";

export type WebsiteError = {
	message: string;
};

export type WebsiteState = {
	website: PublicWebsiteResponse | null;
	status: WebsiteStatus;
	error: WebsiteError | null;
};

const INITIAL_STATE: WebsiteState = {
	website: null,
	status: "idle",
	error: null,
};

function normalizeError(error: unknown): WebsiteError {
	if (error instanceof Error) {
		return { message: error.message };
	}

	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof (error as { message: unknown }).message === "string"
	) {
		return { message: (error as { message: string }).message };
	}

	return { message: "Unknown error" };
}

export type WebsiteStore = Store<WebsiteState> & {
	setLoading(): void;
	setWebsite(website: PublicWebsiteResponse): void;
	setError(error: unknown): void;
	reset(): void;
};

export function createWebsiteStore(
	initialState: WebsiteState = INITIAL_STATE
): WebsiteStore {
	const store = createStore<WebsiteState>(initialState);

	return {
		...store,
		setLoading() {
			store.setState((state) => {
				if (state.status === "loading") {
					return state;
				}

				return {
					website: state.website,
					status: "loading",
					error: null,
				};
			});
		},
		setWebsite(website) {
			store.setState((state) => {
				if (
					state.website === website &&
					state.status === "success" &&
					state.error === null
				) {
					return state;
				}

				return {
					website,
					status: "success",
					error: null,
				};
			});
		},
		setError(error) {
			const normalized = normalizeError(error);

			store.setState((state) => {
				if (
					state.status === "error" &&
					state.error?.message === normalized.message
				) {
					return state;
				}

				return {
					website: state.website,
					status: "error",
					error: normalized,
				};
			});
		},
		reset() {
			store.setState(() => INITIAL_STATE);
		},
	};
}

export function getWebsiteState(store: Store<WebsiteState>): WebsiteState {
	return store.getState();
}
