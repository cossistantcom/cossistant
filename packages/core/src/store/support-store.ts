import { createStore, type Store } from "./create-store";

/**
 * Built-in routes with their parameter types.
 */
export type DefaultRoutes = {
	HOME: undefined;
	ARTICLES: undefined;
	CONVERSATION: { conversationId: string; initialMessage?: string };
	CONVERSATION_HISTORY: undefined;
};

/**
 * Extensible route registry via module augmentation.
 *
 * @example
 * declare module '@cossistant/core' {
 *   interface RouteRegistry {
 *     SETTINGS: { tab: string };
 *   }
 * }
 */
export interface RouteRegistry extends DefaultRoutes {}

// Build discriminated union from route registry
export type NavigationState<
	Routes extends Record<string, unknown> = RouteRegistry,
> = {
	[K in keyof Routes]: Routes[K] extends undefined
		? { page: K; params?: undefined }
		: { page: K; params: Routes[K] };
}[keyof Routes];

// Extract page names as string union
export type SupportPage<
	Routes extends Record<string, unknown> = RouteRegistry,
> = keyof Routes & string;

// Keep backward compatibility
export type SUPPORT_PAGES = SupportPage;

// Typed navigation
export type SupportNavigation<
	Routes extends Record<string, unknown> = RouteRegistry,
> = {
	previousPages: NavigationState<Routes>[];
	current: NavigationState<Routes>;
};

export type SupportConfig = {
	size: "normal" | "larger";
	isOpen: boolean;
	content: {
		home?: {
			header?: string;
			subheader?: string;
			ctaLabel?: string;
		};
	};
};

export type SupportStoreState<
	Routes extends Record<string, unknown> = RouteRegistry,
> = {
	navigation: SupportNavigation<Routes>;
	config: SupportConfig;
};

export type SupportStoreActions<
	Routes extends Record<string, unknown> = RouteRegistry,
> = {
	navigate(state: NavigationState<Routes>): void;
	replace(state: NavigationState<Routes>): void;
	goBack(): void;
	open(): void;
	close(): void;
	toggle(): void;
	updateConfig(config: Partial<SupportConfig>): void;
	reset(): void;
};

export type SupportStoreStorage = {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
};

export type SupportStoreOptions = {
	storage?: SupportStoreStorage;
	storageKey?: string;
};

export type SupportStore<
	Routes extends Record<string, unknown> = RouteRegistry,
> = Store<SupportStoreState<Routes>> & SupportStoreActions<Routes>;

const STORAGE_KEY = "cossistant-support-store";

type PersistedConfig = Pick<SupportConfig, "size" | "isOpen">;

type PersistedState<Routes extends Record<string, unknown> = RouteRegistry> = {
	navigation?: SupportNavigation<Routes>;
	config?: PersistedConfig;
};

function createDefaultNavigation<
	Routes extends Record<string, unknown> = RouteRegistry,
>(): SupportNavigation<Routes> {
	return {
		current: { page: "HOME" } as NavigationState<Routes>,
		previousPages: [],
	};
}

function createDefaultConfig(): SupportConfig {
	return {
		size: "normal",
		content: {},
		isOpen: false,
	};
}

function createDefaultState<
	Routes extends Record<string, unknown> = RouteRegistry,
>(): SupportStoreState<Routes> {
	return {
		navigation: createDefaultNavigation<Routes>(),
		config: createDefaultConfig(),
	};
}

function cloneNavigationState<
	Routes extends Record<string, unknown> = RouteRegistry,
>(state: NavigationState<Routes>): NavigationState<Routes> {
	// Type-safe cloning with params if they exist
	if ("params" in state && state.params !== undefined) {
		return {
			...state,
			params: { ...state.params },
		} as NavigationState<Routes>;
	}
	return { ...state } as NavigationState<Routes>;
}

function isSameNavigationState<
	Routes extends Record<string, unknown> = RouteRegistry,
>(a: NavigationState<Routes>, b: NavigationState<Routes>): boolean {
	if (a.page !== b.page) {
		return false;
	}

	const aParams = a.params as Record<string, unknown> | undefined;
	const bParams = b.params as Record<string, unknown> | undefined;

	if (aParams === bParams) {
		return true;
	}

	if (!(aParams && bParams)) {
		return false;
	}

	const aKeys = Object.keys(aParams);
	if (aKeys.length !== Object.keys(bParams).length) {
		return false;
	}

	return aKeys.every((key) => aParams[key] === bParams[key]);
}

function parsePersistedState<
	Routes extends Record<string, unknown> = RouteRegistry,
>(
	persisted: PersistedState<Routes> | null | undefined,
	fallback: SupportStoreState<Routes>
): SupportStoreState<Routes> {
	if (!persisted) {
		return fallback;
	}

	const persistedNavigation = persisted.navigation;
	const navigation: SupportNavigation<Routes> = {
		current: persistedNavigation?.current
			? cloneNavigationState<Routes>(persistedNavigation.current)
			: cloneNavigationState<Routes>(fallback.navigation.current),
		previousPages: (
			persistedNavigation?.previousPages ?? fallback.navigation.previousPages
		).map((page) => cloneNavigationState<Routes>(page)),
	};

	const config: SupportConfig = {
		...fallback.config,
		...persisted.config,
	};

	return {
		navigation,
		config,
	};
}

function getInitialState<
	Routes extends Record<string, unknown> = RouteRegistry,
>(options: SupportStoreOptions): SupportStoreState<Routes> {
	const fallback = createDefaultState<Routes>();
	const storage = options.storage;
	if (!storage) {
		return fallback;
	}

	try {
		const raw = storage.getItem(options.storageKey ?? STORAGE_KEY);
		if (!raw) {
			return fallback;
		}

		const parsed = JSON.parse(raw) as PersistedState<Routes>;
		return parsePersistedState<Routes>(parsed, fallback);
	} catch (error) {
		console.warn("[SupportStore] Failed to read persisted state", error);
		return fallback;
	}
}

function persistState<Routes extends Record<string, unknown> = RouteRegistry>(
	state: SupportStoreState<Routes>,
	options: SupportStoreOptions
): void {
	const storage = options.storage;
	if (!storage) {
		return;
	}

	const data: PersistedState<Routes> = {
		navigation: {
			current: state.navigation.current,
			previousPages: [...state.navigation.previousPages],
		},
		config: {
			size: state.config.size,
			isOpen: state.config.isOpen,
		},
	};

	try {
		storage.setItem(options.storageKey ?? STORAGE_KEY, JSON.stringify(data));
	} catch (error) {
		console.warn("[SupportStore] Failed to persist state", error);
	}
}

export function createSupportStore<
	Routes extends Record<string, unknown> = RouteRegistry,
>(options: SupportStoreOptions = {}): SupportStore<Routes> {
	const initialState = getInitialState<Routes>(options);
	const store = createStore<SupportStoreState<Routes>>(initialState);

	const commit = (
		updater: (state: SupportStoreState<Routes>) => SupportStoreState<Routes>
	) => {
		const previous = store.getState();
		store.setState(updater);
		const next = store.getState();
		if (next !== previous) {
			persistState(next, options);
		}
	};

	return {
		...store,
		navigate(state) {
			commit((current) => {
				// Avoid pushing duplicate history entries for a no-op navigation
				if (isSameNavigationState(current.navigation.current, state)) {
					return current;
				}

				return {
					navigation: {
						previousPages: [
							...current.navigation.previousPages,
							current.navigation.current,
						],
						current: state,
					},
					config: current.config,
				};
			});
		},
		replace(state) {
			commit((current) => ({
				navigation: {
					...current.navigation,
					current: state,
				},
				config: current.config,
			}));
		},
		goBack() {
			commit((current) => {
				const { previousPages } = current.navigation;

				if (previousPages.length === 0) {
					// No history, go to HOME
					return {
						navigation: {
							previousPages: [],
							current: { page: "HOME" } as NavigationState<Routes>,
						},
						config: current.config,
					};
				}

				const previous = previousPages.at(-1);

				if (!previous) {
					return current;
				}

				// Safeguard: If the previous entry equals the current one (same
				// page AND params), navigate to HOME instead to avoid getting
				// stuck. Same-page entries with different params (e.g. two
				// conversations) are legitimate history.
				if (isSameNavigationState(previous, current.navigation.current)) {
					return {
						navigation: {
							previousPages: [],
							current: { page: "HOME" } as NavigationState<Routes>,
						},
						config: current.config,
					};
				}

				const nextPrevious = previousPages.slice(0, -1);
				return {
					navigation: {
						previousPages: nextPrevious,
						current: previous,
					},
					config: current.config,
				};
			});
		},
		open() {
			commit((current) => ({
				navigation: current.navigation,
				config: { ...current.config, isOpen: true },
			}));
		},
		close() {
			commit((current) => ({
				navigation: current.navigation,
				config: { ...current.config, isOpen: false },
			}));
		},
		toggle() {
			commit((current) => ({
				navigation: current.navigation,
				config: { ...current.config, isOpen: !current.config.isOpen },
			}));
		},
		updateConfig(config) {
			commit((current) => ({
				navigation: current.navigation,
				config: { ...current.config, ...config },
			}));
		},
		reset() {
			commit(() => createDefaultState<Routes>());
		},
	};
}
