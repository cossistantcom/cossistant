import type { DefaultMessage } from "@cossistant/types";
import type { IdentifyContactResponse } from "@cossistant/types/api/contact";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { PublicWebsiteResponse } from "@cossistant/types/api/website";
import { ConversationTimelineType } from "@cossistant/types/enums";
import type { Conversation } from "@cossistant/types/schemas";
import { CossistantClient, type CossistantClientOptions } from "./client";
import { getEnvVarName, resolvePublicKey } from "./resolve-public-key";
import { createStore, type StoreListener } from "./store/create-store";
import {
	createSupportStore,
	type RouteRegistry,
	type SupportConfig,
	type SupportPage,
	type SupportStore,
	type SupportStoreState,
	type SupportStoreStorage,
} from "./store/support-store";
import {
	CossistantAPIError,
	type VisitorMetadata,
	type VisitorResponse,
} from "./types";

const DEFAULT_API_URL = "https://api.cossistant.com/v1";
const DEFAULT_WS_URL = "wss://api.cossistant.com/ws";

const AUTH_ERROR_CODES = new Set([
	"UNAUTHORIZED",
	"FORBIDDEN",
	"INVALID_API_KEY",
	"API_KEY_EXPIRED",
	"API_KEY_MISSING",
	"HTTP_401",
	"HTTP_403",
]);

export const PENDING_SUPPORT_CONVERSATION_ID = "__pending__" as const;

export type SupportControllerConfigurationError = {
	type: "missing_api_key" | "invalid_api_key";
	message: string;
	envVarName: string;
};

export type SupportControllerEventType =
	| "conversationStart"
	| "conversationEnd"
	| "messageSent"
	| "messageReceived"
	| "error";

export type SupportControllerConversationStartEvent = {
	type: "conversationStart";
	conversationId: string;
	conversation?: Conversation;
};

export type SupportControllerConversationEndEvent = {
	type: "conversationEnd";
	conversationId: string;
	conversation?: Conversation;
};

export type SupportControllerMessageSentEvent = {
	type: "messageSent";
	conversationId: string;
	message: TimelineItem;
};

export type SupportControllerMessageReceivedEvent = {
	type: "messageReceived";
	conversationId: string;
	message: TimelineItem;
};

export type SupportControllerErrorEvent = {
	type: "error";
	error: Error;
	context?: string;
};

export type SupportControllerEvent =
	| SupportControllerConversationStartEvent
	| SupportControllerConversationEndEvent
	| SupportControllerMessageSentEvent
	| SupportControllerMessageReceivedEvent
	| SupportControllerErrorEvent;

type SupportControllerEventMap = {
	conversationStart: SupportControllerConversationStartEvent;
	conversationEnd: SupportControllerConversationEndEvent;
	messageSent: SupportControllerMessageSentEvent;
	messageReceived: SupportControllerMessageReceivedEvent;
	error: SupportControllerErrorEvent;
};

type SupportControllerState = {
	client: CossistantClient | null;
	website: PublicWebsiteResponse | null;
	websiteStatus: "idle" | "loading" | "success" | "error";
	error: Error | null;
	configurationError: SupportControllerConfigurationError | null;
	defaultMessages: DefaultMessage[];
	quickOptions: string[];
	unreadCount: number;
	isVisitorBlocked: boolean;
	visitorId: string | null;
};

export type SupportControllerSnapshot = SupportControllerState & {
	support: SupportStoreState;
	navigation: SupportStoreState["navigation"];
	isLoading: boolean;
	isOpen: boolean;
	size: SupportConfig["size"];
};

export type SupportControllerOptions = {
	apiUrl?: string;
	wsUrl?: string;
	publicKey?: string;
	clientOptions?: CossistantClientOptions;
	defaultMessages?: DefaultMessage[];
	quickOptions?: string[];
	autoConnect?: boolean;
	size?: SupportConfig["size"];
	defaultOpen?: boolean;
	storage?: SupportStoreStorage;
	onWsConnect?: () => void;
	onWsDisconnect?: () => void;
	onWsError?: (error: Error) => void;
};

export type SupportController = {
	supportStore: SupportStore;
	start: () => void;
	destroy: () => void;
	getState: () => SupportControllerSnapshot;
	getSnapshot: () => SupportControllerSnapshot;
	subscribe: (listener: StoreListener<SupportControllerSnapshot>) => () => void;
	refresh: (params?: {
		force?: boolean;
	}) => Promise<PublicWebsiteResponse | null>;
	updateOptions: (options: Partial<SupportControllerOptions>) => void;
	updateSupportConfig: (config: Partial<SupportConfig>) => void;
	setDefaultMessages: (messages: DefaultMessage[]) => void;
	setQuickOptions: (options: string[]) => void;
	setUnreadCount: (count: number) => void;
	open: () => void;
	close: () => void;
	toggle: () => void;
	navigate: <K extends keyof RouteRegistry>(options: {
		page: K;
		params?: RouteRegistry[K];
	}) => void;
	replace: <K extends keyof RouteRegistry>(options: {
		page: K;
		params?: RouteRegistry[K];
	}) => void;
	goBack: () => void;
	goHome: () => void;
	openConversation: (conversationId: string) => void;
	startConversation: (initialMessage?: string) => void;
	identify: (params: {
		externalId?: string;
		email?: string;
		name?: string;
		image?: string;
		metadata?: Record<string, unknown>;
		contactOrganizationId?: string;
	}) => Promise<IdentifyContactResponse | null>;
	updateVisitorMetadata: (
		metadata: VisitorMetadata
	) => Promise<VisitorResponse | null>;
	emit: (event: SupportControllerEvent) => void;
	on: <T extends SupportControllerEventType>(
		type: T,
		handler: (event: SupportControllerEventMap[T]) => void
	) => () => void;
	off: <T extends SupportControllerEventType>(
		type: T,
		handler: (event: SupportControllerEventMap[T]) => void
	) => void;
};

type RuntimeOptions = {
	autoConnect: boolean;
	publicKey?: string;
	onWsConnect?: () => void;
	onWsDisconnect?: () => void;
	onWsError?: (error: Error) => void;
};

function isAuthError(error: Error | null): boolean {
	if (!error) {
		return false;
	}

	if (error instanceof CossistantAPIError) {
		const code = error.code?.toUpperCase() ?? "";
		return (
			AUTH_ERROR_CODES.has(code) ||
			code.includes("AUTH") ||
			code.includes("API_KEY")
		);
	}

	const message = error.message?.toLowerCase() ?? "";
	return (
		message.includes("api key") ||
		message.includes("unauthorized") ||
		message.includes("forbidden") ||
		message.includes("not authorized")
	);
}

function getBrowserStorage(): SupportStoreStorage | undefined {
	if (typeof window === "undefined") {
		return;
	}

	return window.localStorage;
}

function createConfigurationError(
	type: SupportControllerConfigurationError["type"],
	message: string
): SupportControllerConfigurationError {
	return {
		type,
		message,
		envVarName: getEnvVarName(),
	};
}

function buildSnapshot(
	state: SupportControllerState,
	support: SupportStoreState
): SupportControllerSnapshot {
	return {
		...state,
		support,
		navigation: support.navigation,
		isLoading:
			state.client !== null &&
			(state.websiteStatus === "loading" || state.websiteStatus === "idle"),
		isOpen: support.config.isOpen,
		size: support.config.size,
	};
}

function deriveUnreadCount(
	client: CossistantClient | null,
	website: PublicWebsiteResponse | null
): number {
	if (!(client && website?.visitor?.id)) {
		return 0;
	}

	const visitorId = website.visitor.id;
	const conversationsState = client.conversationsStore.getState();
	const seenEntriesByConversation = client.seenStore.getState().conversations;

	let count = 0;

	for (const conversationId of conversationsState.ids) {
		const conversation = conversationsState.byId[conversationId];

		if (!conversation) {
			continue;
		}

		if (conversation.status !== "open" || conversation.deletedAt) {
			continue;
		}

		const lastTimelineItem = conversation.lastTimelineItem;
		if (!lastTimelineItem) {
			continue;
		}

		if (lastTimelineItem.type !== ConversationTimelineType.MESSAGE) {
			continue;
		}

		if (
			lastTimelineItem.visitorId &&
			lastTimelineItem.visitorId === visitorId
		) {
			continue;
		}

		const createdAtTime = Date.parse(lastTimelineItem.createdAt);
		if (Number.isNaN(createdAtTime)) {
			continue;
		}

		if (conversation.visitorLastSeenAt) {
			const lastSeenTime = Date.parse(conversation.visitorLastSeenAt);
			if (!Number.isNaN(lastSeenTime) && createdAtTime <= lastSeenTime) {
				continue;
			}
		}

		const seenEntries = seenEntriesByConversation[conversationId];

		if (seenEntries) {
			const visitorSeenEntry = Object.values(seenEntries).find(
				(entry) => entry.actorType === "visitor" && entry.actorId === visitorId
			);

			if (visitorSeenEntry) {
				const lastSeenTime = Date.parse(visitorSeenEntry.lastSeenAt);
				if (!Number.isNaN(lastSeenTime) && createdAtTime <= lastSeenTime) {
					continue;
				}
			}
		}

		count += 1;
	}

	return count;
}

export function createSupportController(
	options: SupportControllerOptions = {}
): SupportController {
	const supportStore = createSupportStore({
		storage: options.storage ?? getBrowserStorage(),
	});

	const supportConfigPatch: Partial<SupportConfig> = {};

	if (options.size !== undefined) {
		supportConfigPatch.size = options.size;
	}

	if (options.defaultOpen !== undefined) {
		supportConfigPatch.isOpen = options.defaultOpen;
	}

	if (Object.keys(supportConfigPatch).length > 0) {
		supportStore.updateConfig(supportConfigPatch);
	}

	const publicKey = resolvePublicKey(options.publicKey);
	const runtimeOptions: RuntimeOptions = {
		autoConnect: options.autoConnect ?? true,
		publicKey: options.publicKey,
		onWsConnect: options.onWsConnect,
		onWsDisconnect: options.onWsDisconnect,
		onWsError: options.onWsError,
	};

	let client: CossistantClient | null = null;
	let configurationError: SupportControllerConfigurationError | null = null;

	if (publicKey) {
		try {
			client = new CossistantClient(
				{
					apiUrl: options.apiUrl ?? DEFAULT_API_URL,
					wsUrl: options.wsUrl ?? DEFAULT_WS_URL,
					publicKey,
				},
				options.clientOptions
			);
		} catch (error) {
			configurationError = createConfigurationError(
				"missing_api_key",
				error instanceof Error
					? error.message
					: "Failed to initialize Cossistant client"
			);
		}
	} else {
		configurationError = createConfigurationError(
			"missing_api_key",
			`Public API key is required. Add ${getEnvVarName()} to your environment variables, or pass it via the publicKey option.`
		);
	}

	const stateStore = createStore<SupportControllerState>({
		client,
		website: null,
		websiteStatus: client ? "idle" : "error",
		error: null,
		configurationError,
		defaultMessages: options.defaultMessages ?? [],
		quickOptions: options.quickOptions ?? [],
		unreadCount: 0,
		isVisitorBlocked: false,
		visitorId: null,
	});

	let snapshot = buildSnapshot(stateStore.getState(), supportStore.getState());
	const listeners = new Set<StoreListener<SupportControllerSnapshot>>();
	const eventHandlers = new Map<
		SupportControllerEventType,
		Set<(event: SupportControllerEvent) => void>
	>();
	let started = false;
	let destroyed = false;
	let prefetchedVisitorId: string | null = null;
	let lastRealtimeStatus = client?.realtime.getState().status ?? "disconnected";
	let lastRealtimeError = client?.realtime.getState().error ?? null;
	const cleanupFns = new Set<() => void>();

	const syncSnapshot = () => {
		snapshot = buildSnapshot(stateStore.getState(), supportStore.getState());
	};

	const notifyListeners = () => {
		syncSnapshot();
		for (const listener of listeners) {
			listener(snapshot);
		}
	};

	cleanupFns.add(stateStore.subscribe(() => notifyListeners()));
	cleanupFns.add(supportStore.subscribe(() => notifyListeners()));

	const syncUnreadCount = () => {
		stateStore.setState((current) => {
			const unreadCount = deriveUnreadCount(current.client, current.website);

			if (current.unreadCount === unreadCount) {
				return current;
			}

			return {
				...current,
				unreadCount,
			};
		});
		syncSnapshot();
	};

	const syncRealtimeConnection = () => {
		const current = stateStore.getState();
		const currentClient = current.client;

		if (!currentClient) {
			return;
		}

		if (
			runtimeOptions.autoConnect &&
			!current.configurationError &&
			!current.isVisitorBlocked &&
			current.website?.id &&
			current.visitorId
		) {
			currentClient.realtime.connect({
				kind: "visitor",
				visitorId: current.visitorId,
				websiteId: current.website.id,
				publicKey: runtimeOptions.publicKey ?? null,
			});
			return;
		}

		currentClient.realtime.disconnect();
	};

	const maybePrefetchConversations = () => {
		const current = stateStore.getState();
		const currentClient = current.client;

		if (!(started && currentClient && runtimeOptions.autoConnect)) {
			return;
		}

		if (current.isVisitorBlocked || !current.website || !current.visitorId) {
			prefetchedVisitorId = null;
			return;
		}

		if (prefetchedVisitorId === current.visitorId) {
			return;
		}

		const hasExistingConversations =
			currentClient.conversationsStore.getState().ids.length > 0;

		prefetchedVisitorId = current.visitorId;

		if (hasExistingConversations) {
			return;
		}

		void currentClient.listConversations().catch(() => {
			prefetchedVisitorId = null;
		});
	};

	const applyWebsiteState = () => {
		const currentClient = stateStore.getState().client;
		if (!currentClient) {
			return;
		}

		const websiteState = currentClient.websiteStore.getState();
		const error = websiteState.error
			? new Error(websiteState.error.message)
			: null;
		const isInvalidApiKey = isAuthError(error);

		stateStore.setState((current) => {
			const website = websiteState.website;
			const visitorId = website?.visitor?.id ?? null;
			const isVisitorBlocked = website?.visitor?.isBlocked ?? false;

			const nextConfigurationError =
				current.configurationError?.type === "missing_api_key"
					? current.configurationError
					: isInvalidApiKey && error
						? createConfigurationError("invalid_api_key", error.message)
						: null;

			return {
				...current,
				website,
				websiteStatus: websiteState.status,
				error,
				configurationError: nextConfigurationError,
				isVisitorBlocked,
				visitorId,
			};
		});
		syncSnapshot();

		const latest = stateStore.getState();

		if (latest.website) {
			currentClient.setWebsiteContext(
				latest.website.id,
				latest.website.visitor?.id ?? undefined
			);
		}

		currentClient.setVisitorBlocked(latest.isVisitorBlocked);
		syncUnreadCount();
		syncRealtimeConnection();
		maybePrefetchConversations();
	};

	const handleRealtimeStateChange = () => {
		const currentClient = stateStore.getState().client;
		if (!currentClient) {
			return;
		}

		const realtimeState = currentClient.realtime.getState();

		if (
			lastRealtimeStatus !== "connected" &&
			realtimeState.status === "connected"
		) {
			runtimeOptions.onWsConnect?.();
		}

		if (
			lastRealtimeStatus === "connected" &&
			realtimeState.status !== "connected"
		) {
			runtimeOptions.onWsDisconnect?.();
		}

		if (realtimeState.error && realtimeState.error !== lastRealtimeError) {
			runtimeOptions.onWsError?.(realtimeState.error);
		}

		lastRealtimeStatus = realtimeState.status;
		lastRealtimeError = realtimeState.error;
	};

	const emit = (event: SupportControllerEvent) => {
		const handlers = eventHandlers.get(event.type);
		if (!handlers) {
			return;
		}

		for (const handler of handlers) {
			handler(event);
		}
	};

	const controller: SupportController = {
		supportStore,
		start() {
			if (started || destroyed) {
				return;
			}

			started = true;

			const currentClient = stateStore.getState().client;
			if (!currentClient) {
				return;
			}

			cleanupFns.add(
				currentClient.websiteStore.subscribe(() => applyWebsiteState())
			);
			cleanupFns.add(
				currentClient.conversationsStore.subscribe(() => syncUnreadCount())
			);
			cleanupFns.add(
				currentClient.seenStore.subscribe(() => syncUnreadCount())
			);
			cleanupFns.add(
				currentClient.realtime.onStateChange(() => handleRealtimeStateChange())
			);

			applyWebsiteState();
			syncRealtimeConnection();
			void currentClient.fetchWebsite().catch((error) => {
				if (error instanceof Error && isAuthError(error)) {
					stateStore.setState((current) => ({
						...current,
						configurationError: createConfigurationError(
							"invalid_api_key",
							error.message
						),
					}));
					syncSnapshot();
				}
			});
		},
		destroy() {
			if (destroyed) {
				return;
			}

			destroyed = true;
			const currentClient = stateStore.getState().client;
			currentClient?.realtime.disconnect();

			for (const cleanup of cleanupFns) {
				cleanup();
			}

			cleanupFns.clear();
			listeners.clear();
			eventHandlers.clear();
		},
		getState() {
			return snapshot;
		},
		getSnapshot() {
			return snapshot;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		async refresh(params = {}) {
			const currentClient = stateStore.getState().client;
			if (!currentClient) {
				return null;
			}

			try {
				const website = await currentClient.fetchWebsite(params);
				applyWebsiteState();
				return website;
			} catch (error) {
				applyWebsiteState();
				if (error instanceof Error && isAuthError(error)) {
					stateStore.setState((current) => ({
						...current,
						configurationError: createConfigurationError(
							"invalid_api_key",
							error.message
						),
					}));
					syncSnapshot();
				}
				return currentClient.websiteStore.getState().website;
			}
		},
		updateOptions(nextOptions) {
			if (nextOptions.autoConnect !== undefined) {
				runtimeOptions.autoConnect = nextOptions.autoConnect;
			}

			if (nextOptions.publicKey !== undefined) {
				runtimeOptions.publicKey = nextOptions.publicKey;
			}

			if (nextOptions.onWsConnect !== undefined) {
				runtimeOptions.onWsConnect = nextOptions.onWsConnect;
			}

			if (nextOptions.onWsDisconnect !== undefined) {
				runtimeOptions.onWsDisconnect = nextOptions.onWsDisconnect;
			}

			if (nextOptions.onWsError !== undefined) {
				runtimeOptions.onWsError = nextOptions.onWsError;
			}

			if (nextOptions.size !== undefined) {
				supportStore.updateConfig({ size: nextOptions.size });
				syncSnapshot();
			}

			if (nextOptions.defaultOpen !== undefined) {
				supportStore.updateConfig({ isOpen: nextOptions.defaultOpen });
				syncSnapshot();
			}

			if (nextOptions.defaultMessages !== undefined) {
				controller.setDefaultMessages(nextOptions.defaultMessages);
			}

			if (nextOptions.quickOptions !== undefined) {
				controller.setQuickOptions(nextOptions.quickOptions);
			}

			syncRealtimeConnection();
		},
		updateSupportConfig(config) {
			supportStore.updateConfig(config);
		},
		setDefaultMessages(messages) {
			stateStore.setState((current) => {
				if (current.defaultMessages === messages) {
					return current;
				}

				return {
					...current,
					defaultMessages: messages,
				};
			});
			syncSnapshot();
		},
		setQuickOptions(optionsList) {
			stateStore.setState((current) => {
				if (current.quickOptions === optionsList) {
					return current;
				}

				return {
					...current,
					quickOptions: optionsList,
				};
			});
			syncSnapshot();
		},
		setUnreadCount(count) {
			stateStore.setState((current) => {
				if (current.unreadCount === count) {
					return current;
				}

				return {
					...current,
					unreadCount: count,
				};
			});
			syncSnapshot();
		},
		open() {
			supportStore.open();
			syncSnapshot();
		},
		close() {
			supportStore.close();
			syncSnapshot();
		},
		toggle() {
			supportStore.toggle();
			syncSnapshot();
		},
		navigate(nextRoute) {
			supportStore.navigate(
				nextRoute as Parameters<typeof supportStore.navigate>[0]
			);
			syncSnapshot();
		},
		replace(nextRoute) {
			supportStore.replace(
				nextRoute as Parameters<typeof supportStore.replace>[0]
			);
			syncSnapshot();
		},
		goBack() {
			supportStore.goBack();
			syncSnapshot();
		},
		goHome() {
			supportStore.navigate({ page: "HOME" });
			syncSnapshot();
		},
		openConversation(conversationId) {
			supportStore.navigate({
				page: "CONVERSATION",
				params: { conversationId },
			});
			supportStore.open();
			syncSnapshot();
		},
		startConversation(initialMessage) {
			supportStore.navigate({
				page: "CONVERSATION",
				params: {
					conversationId: PENDING_SUPPORT_CONVERSATION_ID,
					initialMessage,
				},
			});
			supportStore.open();
			syncSnapshot();
		},
		async identify(params) {
			const currentClient = stateStore.getState().client;
			if (!currentClient) {
				return null;
			}

			try {
				const result = await currentClient.identify(params);
				await controller.refresh({ force: true });
				return result;
			} catch {
				return null;
			}
		},
		async updateVisitorMetadata(metadata) {
			const currentClient = stateStore.getState().client;
			if (!currentClient) {
				return null;
			}

			try {
				const result = await currentClient.updateVisitorMetadata(metadata);
				await controller.refresh({ force: true });
				return result;
			} catch {
				return null;
			}
		},
		emit,
		on(type, handler) {
			if (!eventHandlers.has(type)) {
				eventHandlers.set(type, new Set());
			}

			const handlers = eventHandlers.get(type);
			handlers?.add(handler as (event: SupportControllerEvent) => void);

			return () => {
				handlers?.delete(handler as (event: SupportControllerEvent) => void);
			};
		},
		off(type, handler) {
			const handlers = eventHandlers.get(type);
			handlers?.delete(handler as (event: SupportControllerEvent) => void);
		},
	};

	return controller;
}
