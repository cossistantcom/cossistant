import type { PlasmaClient } from "@plasma/core";
import {
	CossistantAPIError,
	getEnvVarName,
	normalizeLocale,
} from "@plasma/core";
import type { DefaultMessage, PublicWebsiteResponse } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { ConversationTimelineType } from "@plasma/types/enums";
import React from "react";
import { useStoreSelector } from "./hooks/private/store/use-store-selector";
import { useWebsiteStore } from "./hooks/private/store/use-website-store";
import {
	type ConfigurationError,
	useClient,
} from "./hooks/private/use-rest-client";
import { WebSocketProvider } from "./support";
import { IdentificationProvider } from "./support/context/identification";
import {
	initializeSupportStore,
	useSupportStore,
} from "./support/store/support-store";

/**
 * Auth-related error codes that indicate API key issues.
 */
const AUTH_ERROR_CODES = new Set([
	"UNAUTHORIZED",
	"FORBIDDEN",
	"INVALID_API_KEY",
	"API_KEY_EXPIRED",
	"API_KEY_MISSING",
	"HTTP_401",
	"HTTP_403",
]);

/**
 * Check if an error is an authentication/authorization error.
 */
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

	// Check error message as fallback
	const message = error.message?.toLowerCase() ?? "";
	return (
		message.includes("api key") ||
		message.includes("unauthorized") ||
		message.includes("forbidden") ||
		message.includes("not authorized")
	);
}

export type SupportProviderProps = {
	children: React.ReactNode;
	defaultOpen?: boolean;
	apiUrl?: string;
	wsUrl?: string;
	publicKey?: string;
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
	configurationError: ConfigurationError | null;
	/**
	 * Underlying client instance for direct API access.
	 *
	 * @remarks `PlasmaClient | null`
	 * @fumadocsType `PlasmaClient | null`
	 * @fumadocsHref #cossistantclient
	 */
	client: PlasmaClient | null;
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

type WebsiteData = NonNullable<CossistantContextValue["website"]>;

type VisitorWithLocale = WebsiteData["visitor"] extends null | undefined
	? undefined
	: NonNullable<WebsiteData["visitor"]> & { locale: string | null };

type ConversationSnapshot = {
	id: string;
	lastTimelineItem: TimelineItem | null;
	visitorLastSeenAt: string | null;
	status: string;
	deletedAt: string | null;
};

function areConversationSnapshotsEqual(
	a: ConversationSnapshot[],
	b: ConversationSnapshot[]
): boolean {
	if (a === b) {
		return true;
	}

	if (a.length !== b.length) {
		return false;
	}

	for (let index = 0; index < a.length; index += 1) {
		const snapshotA = a[index];
		const snapshotB = b[index];

		if (!snapshotA) {
			return false;
		}
		if (!snapshotB) {
			return false;
		}

		const aLastCreatedAt = snapshotA.lastTimelineItem?.createdAt ?? null;
		const bLastCreatedAt = snapshotB.lastTimelineItem?.createdAt ?? null;
		if (
			snapshotA.id !== snapshotB.id ||
			aLastCreatedAt !== bLastCreatedAt ||
			snapshotA.visitorLastSeenAt !== snapshotB.visitorLastSeenAt ||
			snapshotA.status !== snapshotB.status ||
			snapshotA.deletedAt !== snapshotB.deletedAt
		) {
			return false;
		}
	}

	return true;
}

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
 * Internal implementation that wires the REST client and websocket provider
 * together before exposing the combined context.
 */
function SupportProviderInner({
	children,
	apiUrl,
	wsUrl,
	publicKey,
	defaultMessages,
	quickOptions,
	autoConnect,
	onWsConnect,
	onWsDisconnect,
	onWsError,
	size = "normal",
	defaultOpen = false,
}: SupportProviderProps) {
	const [unreadCount, setUnreadCount] = React.useState(0);
	const prefetchedVisitorRef = React.useRef<string | null>(null);
	const [_defaultMessages, _setDefaultMessages] = React.useState<
		DefaultMessage[]
	>(defaultMessages ?? []);
	const [_quickOptions, _setQuickOptions] = React.useState<string[]>(
		quickOptions ?? []
	);

	// Initialize support store with configuration
	React.useEffect(() => {
		initializeSupportStore({ size, defaultOpen });
	}, [size, defaultOpen]);

	// Get support store state and actions
	const { config, open, close, toggle } = useSupportStore();

	// Update state when props change (for initial values from provider)
	React.useEffect(() => {
		if (defaultMessages?.length) {
			_setDefaultMessages(defaultMessages);
		}
	}, [defaultMessages]);

	React.useEffect(() => {
		if (quickOptions?.length) {
			_setQuickOptions(quickOptions);
		}
	}, [quickOptions]);

	const { client, configurationError: clientConfigError } = useClient(
		publicKey,
		apiUrl,
		wsUrl
	);

	// Only use website store if we have a valid client
	const { website, isLoading, error: websiteError } = useWebsiteStore(client);
	const isVisitorBlocked = website?.visitor?.isBlocked ?? false;
	const visitorId = website?.visitor?.id ?? null;

	// Derive final configuration error from both client error and API auth errors
	const configurationError = React.useMemo<ConfigurationError | null>(() => {
		// Client-level config error takes precedence (missing API key)
		if (clientConfigError) {
			return clientConfigError;
		}

		// Check if website error is an auth error (invalid/expired API key)
		if (websiteError && isAuthError(websiteError)) {
			return {
				type: "invalid_api_key",
				message: websiteError.message,
				envVarName: getEnvVarName(),
			};
		}

		return null;
	}, [clientConfigError, websiteError]);

	const seenEntriesByConversation = useStoreSelector(
		client?.seenStore ?? null,
		React.useCallback(
			(
				state: {
					conversations: Record<
						string,
						Record<
							string,
							{ actorType: string; actorId: string; lastSeenAt: string }
						>
					>;
				} | null
			) => state?.conversations ?? {},
			[]
		)
	);

	const conversationSnapshots = useStoreSelector(
		client?.conversationsStore ?? null,
		React.useCallback(
			(
				state: {
					ids: string[];
					byId: Record<
						string,
						| {
								id: string;
								lastTimelineItem?: TimelineItem | null;
								visitorLastSeenAt?: string | null;
								status?: string;
								deletedAt?: string | null;
						  }
						| undefined
					>;
				} | null
			): ConversationSnapshot[] =>
				state
					? state.ids
							.map((id) => {
								const conversation = state.byId[id];

								if (!conversation) {
									return null;
								}

								return {
									id: conversation.id,
									lastTimelineItem: conversation.lastTimelineItem ?? null,
									visitorLastSeenAt: conversation.visitorLastSeenAt ?? null,
									status: conversation.status ?? "open",
									deletedAt: conversation.deletedAt ?? null,
								} satisfies ConversationSnapshot;
							})
							.filter(
								(snapshot): snapshot is ConversationSnapshot =>
									snapshot !== null
							)
					: [],
			[]
		),
		areConversationSnapshotsEqual
	);

	const derivedUnreadCount = React.useMemo(() => {
		if (!visitorId) {
			return 0;
		}

		let count = 0;

		for (const {
			id: conversationId,
			lastTimelineItem,
			visitorLastSeenAt,
			status,
			deletedAt,
		} of conversationSnapshots) {
			// Skip resolved, spam, or deleted conversations
			if (status !== "open" || deletedAt) {
				continue;
			}

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

			// First check visitorLastSeenAt from the API response (available immediately)
			if (visitorLastSeenAt) {
				const lastSeenTime = Date.parse(visitorLastSeenAt);
				if (!Number.isNaN(lastSeenTime) && createdAtTime <= lastSeenTime) {
					continue;
				}
			}

			// Fall back to seen store (updated via realtime events)
			const seenEntries = seenEntriesByConversation[conversationId];

			if (seenEntries) {
				const visitorSeenEntry = Object.values(seenEntries).find(
					(entry) =>
						entry.actorType === "visitor" && entry.actorId === visitorId
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
	}, [conversationSnapshots, seenEntriesByConversation, visitorId]);

	React.useEffect(() => {
		setUnreadCount(derivedUnreadCount);
	}, [derivedUnreadCount, setUnreadCount]);

	// Prime REST client with website/visitor context so headers are sent reliably
	React.useEffect(() => {
		if (!(website && client)) {
			return;
		}

		client.setWebsiteContext(website.id, website.visitor?.id ?? undefined);
	}, [client, website]);

	React.useEffect(() => {
		if (!client) {
			return;
		}

		if (isVisitorBlocked) {
			prefetchedVisitorRef.current = null;
			return;
		}

		if (!autoConnect) {
			return;
		}

		if (!website) {
			return;
		}

		if (!visitorId) {
			return;
		}

		if (prefetchedVisitorRef.current === visitorId) {
			return;
		}

		const hasExistingConversations =
			client.conversationsStore.getState().ids.length > 0;

		prefetchedVisitorRef.current = visitorId;

		if (hasExistingConversations) {
			return;
		}

		void client.listConversations().catch((err) => {
			console.error("[SupportProvider] Failed to prefetch conversations", err);
			prefetchedVisitorRef.current = null;
		});
	}, [autoConnect, client, isVisitorBlocked, visitorId, website]);

	const error = websiteError;

	React.useEffect(() => {
		if (!client) {
			return;
		}
		client.setVisitorBlocked(isVisitorBlocked);
	}, [client, isVisitorBlocked]);

	const setDefaultMessages = React.useCallback((messages: DefaultMessage[]) => {
		_setDefaultMessages(messages);
	}, []);

	const setQuickOptions = React.useCallback((options: string[]) => {
		_setQuickOptions(options);
	}, []);

	const value = React.useMemo<CossistantContextValue>(
		() => ({
			website,
			unreadCount,
			setUnreadCount,
			isLoading,
			error,
			configurationError,
			client,
			defaultMessages: _defaultMessages,
			setDefaultMessages,
			quickOptions: _quickOptions,
			setQuickOptions,
			isOpen: config.isOpen,
			open,
			close,
			toggle,
		}),
		[
			website,
			unreadCount,
			isLoading,
			error,
			configurationError,
			client,
			_defaultMessages,
			_quickOptions,
			setDefaultMessages,
			setQuickOptions,
			config.isOpen,
			open,
			close,
			toggle,
		]
	);

	return (
		<SupportContext.Provider value={value}>
			<IdentificationProvider>
				<WebSocketProvider
					autoConnect={autoConnect && !isVisitorBlocked && !configurationError}
					onConnect={onWsConnect}
					onDisconnect={onWsDisconnect}
					onError={onWsError}
					publicKey={publicKey}
					visitorId={isVisitorBlocked ? undefined : website?.visitor?.id}
					websiteId={website?.id}
					wsUrl={wsUrl}
				>
					{children}
				</WebSocketProvider>
			</IdentificationProvider>
		</SupportContext.Provider>
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
	apiUrl = "https://api.plasma-pandora.com/v1",
	wsUrl = "wss://api.plasma-pandora.com/ws",
	publicKey,
	defaultMessages,
	quickOptions,
	autoConnect = true,
	onWsConnect,
	onWsDisconnect,
	onWsError,
	size = "normal",
	defaultOpen = false,
}: SupportProviderProps): React.ReactElement {
	return (
		<SupportProviderInner
			apiUrl={apiUrl}
			autoConnect={autoConnect}
			defaultMessages={defaultMessages}
			defaultOpen={defaultOpen}
			onWsConnect={onWsConnect}
			onWsDisconnect={onWsDisconnect}
			onWsError={onWsError}
			publicKey={publicKey}
			quickOptions={quickOptions}
			size={size}
			wsUrl={wsUrl}
		>
			{children}
		</SupportProviderInner>
	);
}

/**
 * Convenience hook that exposes the aggregated support context. Throws when it
 * is consumed outside of `SupportProvider` to catch integration mistakes.
 */
export function useSupport(): UseSupportValue {
	const context = React.useContext(SupportContext);
	if (!context) {
		throw new Error(
			"useSupport must be used within a cossistant SupportProvider"
		);
	}

	const availableHumanAgents = context.website?.availableHumanAgents || [];
	const availableAIAgents = context.website?.availableAIAgents || [];
	const visitorLanguage = context.website?.visitor?.language || null;

	// Get additional config from support store
	const { config } = useSupportStore();

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
		size: config.size,
	};
}

// Re-export ConfigurationError type for consumers
export type { ConfigurationError } from "./hooks/private/use-rest-client";
