import type {
	SupportOnboardingState,
	SupportStateResponse,
} from "@cossistant/types/api/support";
import {
	EMPTY_SUPPORT_ONBOARDING_STATE,
	normalizeSupportFeatureFlags,
	normalizeSupportOnboardingState,
} from "@cossistant/types/support-state";
import { createStore, type Store } from "./create-store";

export {
	normalizeSupportFeatureFlags,
	normalizeSupportOnboardingState,
} from "@cossistant/types/support-state";

export type SupportStateStatus = "idle" | "loading" | "success" | "error";

export type SupportStateError = {
	message: string;
};

export type SupportState = {
	featureFlags: string[];
	onboarding: SupportOnboardingState;
	status: SupportStateStatus;
	error: SupportStateError | null;
};

export type SupportStateStore = Store<SupportState> & {
	setLoading(): void;
	setSupportState(state: SupportStateResponse): void;
	setError(error: unknown): void;
	updateOptimistic(
		updater: (state: SupportState) => SupportState
	): SupportState;
	reset(): void;
};

export const EMPTY_ONBOARDING_STATE: SupportOnboardingState =
	EMPTY_SUPPORT_ONBOARDING_STATE;

export const INITIAL_SUPPORT_STATE: SupportState = {
	featureFlags: [],
	onboarding: EMPTY_ONBOARDING_STATE,
	status: "idle",
	error: null,
};

function normalizeError(error: unknown): SupportStateError {
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

function normalizeSupportState(state: SupportStateResponse): SupportState {
	return {
		featureFlags: normalizeSupportFeatureFlags(state.featureFlags),
		onboarding: normalizeSupportOnboardingState(state.onboarding),
		status: "success",
		error: null,
	};
}

export function createSupportStateStore(
	initialState: SupportState = INITIAL_SUPPORT_STATE
): SupportStateStore {
	const store = createStore<SupportState>(initialState);

	return {
		...store,
		setLoading() {
			store.setState((state) => {
				if (state.status === "loading") {
					return state;
				}

				return {
					...state,
					status: "loading",
					error: null,
				};
			});
		},
		setSupportState(state) {
			store.setState(() => normalizeSupportState(state));
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
					...state,
					status: "error",
					error: normalized,
				};
			});
		},
		updateOptimistic(updater) {
			const previous = store.getState();
			store.setState((state) => ({
				...updater(state),
				status: "success",
				error: null,
			}));
			return previous;
		},
		reset() {
			store.setState(() => INITIAL_SUPPORT_STATE);
		},
	};
}
