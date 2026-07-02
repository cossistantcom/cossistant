"use client";

import type {
	CossistantClient,
	CossistantClientOptions,
} from "@cossistant/core/client";
import { normalizeLocale } from "@cossistant/core/locale-utils";
import type {
	SupportConfig,
	SupportStoreState,
	SupportStoreStorage,
} from "@cossistant/core/store/support-store";
import type { AnySupportConfig } from "@cossistant/core/support-config";
import {
	createSupportController,
	type SupportController,
	type SupportControllerConfigurationError,
	type SupportControllerOptions,
	type SupportControllerSnapshot,
} from "@cossistant/core/support-controller";
import type { DefaultMessage } from "@cossistant/types";
import type { PublicWebsiteResponse } from "@cossistant/types/api/website";
import React from "react";
import {
	SupportControllerContext,
	useOptionalSupportController,
} from "./controller-context";
import { useStoreSelector } from "./hooks/private/store/use-store-selector";
import { processingStoreSingleton } from "./realtime/processing-store";
import { seenStoreSingleton } from "./realtime/seen-store";
import { typingStoreSingleton } from "./realtime/typing-store";
import { IdentificationProvider } from "./support/context/identification";
import { WebSocketProvider } from "./support/context/websocket";

export type SupportProviderProps = {
	children?: React.ReactNode;
	controller?: SupportController;
	defaultOpen?: boolean;
	apiUrl?: string;
	wsUrl?: string;
	publicKey?: string;
	support?: AnySupportConfig;
	defaultMessages?: DefaultMessage[];
	quickOptions?: string[];
	autoConnect?: boolean;
	onWsConnect?: () => void;
	onWsDisconnect?: () => void;
	onWsError?: (error: Error) => void;
	size?: "normal" | "larger";
};

export type CossistantProviderProps = SupportProviderProps;

export type CossistantContextValue = {
	/**
	 * Website configuration and agent availability data.
	 *
	 * @remarks `PublicWebsiteResponse | null`
	 * @fumadocsType `PublicWebsiteResponse | null`
	 * @fumadocsHref #publicwebsiteresponse
	 */
	website: PublicWebsiteResponse | null;
	/**
	 * Custom welcome messages shown before a conversation starts.
	 *
	 * @remarks `DefaultMessage[]`
	 * @fumadocsHref #defaultmessage
	 */
	defaultMessages: DefaultMessage[];
	/**
	 * Quick reply options displayed to users.
	 */
	quickOptions: string[];
	/**
	 * Replace the current default messages for the widget instance.
	 */
	setDefaultMessages: (messages: DefaultMessage[]) => void;
	/**
	 * Replace the current quick reply options for the widget instance.
	 */
	setQuickOptions: (options: string[]) => void;
	/**
	 * Number of unread messages across all conversations.
	 */
	unreadCount: number;
	/**
	 * Update the unread message count for the widget instance.
	 */
	setUnreadCount: (count: number) => void;
	/**
	 * Whether website data is still loading.
	 */
	isLoading: boolean;
	/**
	 * Error object when website data failed to load.
	 */
	error: Error | null;
	/**
	 * Configuration error caused by missing or invalid widget setup.
	 */
	configurationError: SupportControllerConfigurationError | null;
	/**
	 * Underlying client instance for direct API access.
	 *
	 * @remarks `CossistantClient | null`
	 * @fumadocsType `CossistantClient | null`
	 * @fumadocsHref #cossistantclient
	 */
	client: CossistantClient | null;
	/**
	 * Whether the support widget is currently open.
	 */
	isOpen: boolean;
	/**
	 * Open the support widget.
	 *
	 * @returns void
	 */
	open: () => void;
	/**
	 * Close the support widget.
	 *
	 * @returns void
	 */
	close: () => void;
	/**
	 * Toggle the support widget open or closed.
	 *
	 * @returns void
	 */
	toggle: () => void;
};

type ConfigurationError = SupportControllerConfigurationError;

type WebsiteData = NonNullable<CossistantContextValue["website"]>;

type VisitorWithLocale = WebsiteData["visitor"] extends null | undefined
	? undefined
	: NonNullable<WebsiteData["visitor"]> & { locale: string | null };

const sharedClientOptions = {
	processingStore: processingStoreSingleton,
	seenStore: seenStoreSingleton,
	typingStore: typingStoreSingleton,
} satisfies CossistantClientOptions;

export type UseSupportValue = CossistantContextValue & {
	/**
	 * List of human support agents currently available.
	 *
	 * @remarks `HumanAgent[]`
	 * @fumadocsType `HumanAgent[]`
	 * @fumadocsHref #humanagent
	 */
	availableHumanAgents: NonNullable<WebsiteData["availableHumanAgents"]> | [];
	/**
	 * List of AI support agents currently available.
	 *
	 * @remarks `AIAgent[]`
	 * @fumadocsType `AIAgent[]`
	 * @fumadocsHref #aiagent
	 */
	availableAIAgents: NonNullable<WebsiteData["availableAIAgents"]> | [];
	/**
	 * Current visitor data with normalized locale information.
	 *
	 * @remarks `PublicVisitor & { locale: string | null }`
	 * @fumadocsType `PublicVisitor & { locale: string | null }`
	 * @fumadocsHref #publicvisitor
	 */
	visitor?: VisitorWithLocale;
	/**
	 * Current widget size configuration.
	 */
	size: "normal" | "larger";
};

export const SupportContext = React.createContext<
	CossistantContextValue | undefined
>(undefined);

/**
 * Returns raw support context when a SupportProvider is present.
 *
 * This is intentionally non-throwing so lower-level hooks can support an
 * explicit-client mode while still using provider context as a fallback.
 */
export function useOptionalSupportContext(): CossistantContextValue | null {
	return React.useContext(SupportContext) ?? null;
}

// Mirrors the persisted payload written by @cossistant/core's support store
// (see core/src/store/support-store.ts persistState). The key and shape are
// frozen: changing them in core would already break existing visitors.
const SUPPORT_STORE_STORAGE_KEY = "cossistant-support-store";

type PersistedSupportState = {
	navigation?: SupportStoreState["navigation"];
	config?: Partial<Pick<SupportConfig, "size" | "isOpen">>;
};

type DeferredSupportStorage = SupportStoreStorage & {
	activate: () => void;
};

/**
 * Storage adapter that stays inert until activated after mount. The server
 * render and the first client render therefore see identical (default) state
 * — avoiding hydration mismatches — and render stays free of localStorage
 * side effects. Persisted state is merged back in an effect.
 */
function createDeferredBrowserStorage(): DeferredSupportStorage {
	let active = false;

	const resolveStorage = () =>
		typeof window === "undefined" ? null : window.localStorage;

	return {
		getItem(key) {
			return active ? (resolveStorage()?.getItem(key) ?? null) : null;
		},
		setItem(key, value) {
			if (active) {
				resolveStorage()?.setItem(key, value);
			}
		},
		removeItem(key) {
			if (active) {
				resolveStorage()?.removeItem(key);
			}
		},
		activate() {
			active = true;
		},
	};
}

function readPersistedSupportState(): PersistedSupportState | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const raw = window.localStorage.getItem(SUPPORT_STORE_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as PersistedSupportState) : null;
	} catch {
		return null;
	}
}

const UPDATABLE_OPTION_KEYS = [
	"autoConnect",
	"defaultMessages",
	"quickOptions",
	"size",
	"defaultOpen",
	"onWsConnect",
	"onWsDisconnect",
	"onWsError",
	"support",
] as const;

type UpdatableOptionKey = (typeof UPDATABLE_OPTION_KEYS)[number];

type UpdatableOptions = Pick<SupportControllerOptions, UpdatableOptionKey>;

function setUpdatableOption<K extends UpdatableOptionKey>(
	patch: Partial<UpdatableOptions>,
	key: K,
	value: UpdatableOptions[K]
): void {
	patch[key] = value;
}

type OwnedControllerHandle = {
	controller: SupportController;
	storage: DeferredSupportStorage;
	// Options already applied at creation; the options effect only pushes
	// values that changed relative to the last applied ones.
	appliedOptions: UpdatableOptions;
	hydrated: boolean;
};

/**
 * Merges the persisted widget state into a freshly created owned controller
 * after mount. Persisted state wins over `defaultOpen` (a default only for
 * visitors without stored state); an explicit `size` prop stays authoritative.
 */
function hydrateOwnedController(handle: OwnedControllerHandle): void {
	if (handle.hydrated) {
		return;
	}

	handle.hydrated = true;
	handle.storage.activate();

	const persisted = readPersistedSupportState();
	if (!persisted) {
		return;
	}

	const explicitSize = handle.appliedOptions.size;

	handle.controller.supportStore.setState((current) => {
		const config = { ...current.config };

		if (typeof persisted.config?.isOpen === "boolean") {
			config.isOpen = persisted.config.isOpen;
		}

		if (persisted.config?.size !== undefined && explicitSize === undefined) {
			config.size = persisted.config.size;
		}

		const navigation = persisted.navigation?.current
			? {
					current: persisted.navigation.current,
					previousPages: persisted.navigation.previousPages ?? [],
				}
			: current.navigation;

		return { config, navigation };
	});
}

function resolveActiveController(
	externalController: SupportController | undefined,
	owned: OwnedControllerHandle | null
): SupportController {
	if (externalController) {
		return externalController;
	}

	if (!owned) {
		throw new Error("SupportProvider could not resolve a support controller");
	}

	return owned.controller;
}

function shallowEqual<T extends Record<string, unknown>>(
	previous: T,
	next: T
): boolean {
	if (Object.is(previous, next)) {
		return true;
	}

	const keys = Object.keys(previous) as (keyof T)[];

	if (keys.length !== Object.keys(next).length) {
		return false;
	}

	return keys.every((key) => Object.is(previous[key], next[key]));
}

/**
 * Internal implementation that wires the REST client and websocket provider
 * together before exposing the combined context.
 */
function SupportProviderInner({
	children,
	controller: externalController,
	apiUrl,
	wsUrl,
	publicKey,
	support,
	defaultMessages,
	quickOptions,
	autoConnect,
	onWsConnect,
	onWsDisconnect,
	onWsError,
	size,
	defaultOpen,
}: SupportProviderProps) {
	// Bumped to recreate the owned controller when a deferred destroy already
	// ran (e.g. an offscreen/Activity remount past one macrotask).
	const [ownedGeneration, setOwnedGeneration] = React.useState(0);

	// Only recreated when the connection identity changes; every other option
	// (including `support`) is synced in place through updateOptions.
	const owned = React.useMemo<OwnedControllerHandle | null>(() => {
		if (externalController) {
			return null;
		}

		const storage = createDeferredBrowserStorage();
		const appliedOptions: UpdatableOptions = {
			autoConnect,
			defaultMessages,
			defaultOpen,
			onWsConnect,
			onWsDisconnect,
			onWsError,
			quickOptions,
			size,
			support,
		};

		return {
			appliedOptions,
			controller: createSupportController({
				apiUrl,
				autoConnect,
				clientOptions: sharedClientOptions,
				defaultMessages: defaultMessages ?? [],
				defaultOpen,
				onWsConnect,
				onWsDisconnect,
				onWsError,
				publicKey,
				quickOptions: quickOptions ?? [],
				size,
				storage,
				support,
				wsUrl,
			}),
			hydrated: false,
			storage,
		};
	}, [apiUrl, externalController, ownedGeneration, publicKey, wsUrl]);
	const controller = resolveActiveController(externalController, owned);
	const ownsController = externalController === undefined;
	const pendingOwnedControllerDisposalsRef = React.useRef(
		new Map<SupportController, ReturnType<typeof globalThis.setTimeout>>()
	);
	const destroyedOwnedControllersRef = React.useRef(
		new WeakSet<SupportController>()
	);
	const lastAppliedOptionsRef = React.useRef<{
		controller: SupportController;
		options: UpdatableOptions;
	} | null>(null);

	React.useEffect(() => {
		const next: UpdatableOptions = {
			autoConnect,
			defaultMessages,
			defaultOpen,
			onWsConnect,
			onWsDisconnect,
			onWsError,
			quickOptions,
			size,
			support,
		};
		const lastApplied = lastAppliedOptionsRef.current;
		let previous: UpdatableOptions = {};

		if (lastApplied?.controller === controller) {
			previous = lastApplied.options;
		} else if (owned?.controller === controller) {
			previous = owned.appliedOptions;
		}

		// Only push options the consumer explicitly provided and that changed
		// since they were last applied. Re-pushing defaults would stomp runtime
		// state (e.g. `defaultOpen` force-closing an open widget) and external
		// controller configuration.
		const patch: Partial<UpdatableOptions> = {};

		for (const key of UPDATABLE_OPTION_KEYS) {
			const value = next[key];

			if (value !== undefined && value !== previous[key]) {
				setUpdatableOption(patch, key, value);
			}
		}

		lastAppliedOptionsRef.current = { controller, options: next };

		if (Object.keys(patch).length > 0) {
			controller.updateOptions(patch);
		}
	}, [
		autoConnect,
		controller,
		defaultMessages,
		defaultOpen,
		onWsConnect,
		onWsDisconnect,
		onWsError,
		owned,
		quickOptions,
		size,
		support,
	]);

	React.useEffect(() => {
		const pendingDisposals = pendingOwnedControllerDisposalsRef.current;
		const pendingDisposal = pendingDisposals.get(controller);

		if (pendingDisposal !== undefined) {
			globalThis.clearTimeout(pendingDisposal);
			pendingDisposals.delete(controller);
		}

		if (destroyedOwnedControllersRef.current.has(controller)) {
			// The deferred destroy already ran, so this controller can never be
			// started again — recreate it instead of mounting a dead widget.
			setOwnedGeneration((generation) => generation + 1);
			return;
		}

		if (owned?.controller === controller) {
			hydrateOwnedController(owned);
		}

		controller.start();
		return () => {
			if (!ownsController) {
				return;
			}

			const existingDisposal = pendingDisposals.get(controller);

			if (existingDisposal !== undefined) {
				globalThis.clearTimeout(existingDisposal);
			}

			const timeoutId = globalThis.setTimeout(() => {
				pendingDisposals.delete(controller);
				destroyedOwnedControllersRef.current.add(controller);
				controller.destroy();
			}, 0);

			pendingDisposals.set(controller, timeoutId);
		};
	}, [controller, owned, ownsController]);

	// Narrow selection + shallow equality so unrelated store changes (e.g.
	// widget navigation) do not churn the context value and re-render every
	// useSupport consumer.
	const snapshot = useStoreSelector(
		controller,
		React.useCallback(
			(state: SupportControllerSnapshot) => ({
				client: state.client,
				configurationError: state.configurationError,
				defaultMessages: state.defaultMessages,
				error: state.error,
				isLoading: state.isLoading,
				isOpen: state.isOpen,
				isVisitorBlocked: state.isVisitorBlocked,
				quickOptions: state.quickOptions,
				unreadCount: state.unreadCount,
				website: state.website,
			}),
			[]
		),
		shallowEqual
	);

	const value = React.useMemo<CossistantContextValue>(
		() => ({
			website: snapshot.website,
			unreadCount: snapshot.unreadCount,
			setUnreadCount: controller.setUnreadCount,
			isLoading: snapshot.isLoading,
			error: snapshot.error,
			configurationError: snapshot.configurationError,
			client: snapshot.client,
			defaultMessages: snapshot.defaultMessages,
			setDefaultMessages: controller.setDefaultMessages,
			quickOptions: snapshot.quickOptions,
			setQuickOptions: controller.setQuickOptions,
			isOpen: snapshot.isOpen,
			open: controller.open,
			close: controller.close,
			toggle: controller.toggle,
		}),
		[controller, snapshot]
	);

	return (
		<SupportControllerContext.Provider value={controller}>
			<SupportContext.Provider value={value}>
				<IdentificationProvider>
					<WebSocketProvider
						autoConnect={
							(autoConnect ?? true) &&
							!snapshot.isVisitorBlocked &&
							!snapshot.configurationError
						}
						onConnect={onWsConnect}
						onDisconnect={onWsDisconnect}
						onError={onWsError}
						publicKey={publicKey}
						visitorId={
							snapshot.isVisitorBlocked
								? undefined
								: snapshot.website?.visitor?.id
						}
						websiteId={snapshot.website?.id}
						wsUrl={wsUrl}
					>
						{children}
					</WebSocketProvider>
				</IdentificationProvider>
			</SupportContext.Provider>
		</SupportControllerContext.Provider>
	);
}

/**
 * Hosts the entire customer support widget ecosystem by handing out context
 * about the current website, visitor, unread counts, realtime subscriptions
 * and the REST client. Provide your Cossistant public key plus optional
 * defaults to configure the widget behaviour.
 */
export function SupportProvider({
	children,
	controller,
	apiUrl = "https://api.cossistant.com/v1",
	wsUrl = "wss://api.cossistant.com/ws",
	publicKey,
	support,
	defaultMessages,
	quickOptions,
	autoConnect,
	onWsConnect,
	onWsDisconnect,
	onWsError,
	size,
	defaultOpen,
}: SupportProviderProps): React.ReactElement {
	return (
		<SupportProviderInner
			apiUrl={apiUrl}
			autoConnect={autoConnect}
			controller={controller}
			defaultMessages={defaultMessages}
			defaultOpen={defaultOpen}
			onWsConnect={onWsConnect}
			onWsDisconnect={onWsDisconnect}
			onWsError={onWsError}
			publicKey={publicKey}
			quickOptions={quickOptions}
			size={size}
			support={support}
			wsUrl={wsUrl}
		>
			{children}
		</SupportProviderInner>
	);
}

const selectWidgetSize = (state: SupportControllerSnapshot | null) =>
	state?.size ?? "normal";

/**
 * Convenience hook that exposes the aggregated support context. Throws when it
 * is consumed outside of `SupportProvider` to catch integration mistakes.
 */
export function useSupport(): UseSupportValue {
	const context = useOptionalSupportContext();
	const controller = useOptionalSupportController();
	// Narrow size selection so navigation/open-state changes alone do not
	// re-render every useSupport consumer.
	const size = useStoreSelector(controller, selectWidgetSize);

	if (!context) {
		throw new Error(
			"useSupport must be used within a cossistant SupportProvider"
		);
	}

	const availableHumanAgents = context.website?.availableHumanAgents || [];
	const availableAIAgents = context.website?.availableAIAgents || [];
	const visitorLanguage = context.website?.visitor?.language || null;

	// Create visitor object with normalized locale
	const visitor = context.website?.visitor
		? {
				...context.website.visitor,
				locale: normalizeLocale(visitorLanguage),
			}
		: undefined;

	return {
		...context,
		availableHumanAgents,
		availableAIAgents,
		visitor,
		size,
	};
}

// Re-export ConfigurationError type for consumers
export type { ConfigurationError };
