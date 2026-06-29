"use client";

import type {
	CossistantClient,
	CossistantClientOptions,
} from "@cossistant/core/client";
import { normalizeLocale } from "@cossistant/core/locale-utils";
import type { AnySupportConfig } from "@cossistant/core/support-config";
import {
	createSupportController,
	type SupportController,
	type SupportControllerConfigurationError,
} from "@cossistant/core/support-controller";
import type { DefaultMessage } from "@cossistant/types";
import type { PublicWebsiteResponse } from "@cossistant/types/api/website";
import React from "react";
import { SupportControllerContext } from "./controller-context";
import { useStoreSelector } from "./hooks/private/store/use-store-selector";
import { processingStoreSingleton } from "./realtime/processing-store";
import { seenStoreSingleton } from "./realtime/seen-store";
import { typingStoreSingleton } from "./realtime/typing-store";
import { IdentificationProvider } from "./support/context/identification";
import { WebSocketProvider } from "./support/context/websocket";
import { useSupportStore } from "./support/store/support-store";

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
	size = "normal",
	defaultOpen = false,
}: SupportProviderProps) {
	const ownedController = React.useMemo(
		() =>
			createSupportController({
				apiUrl,
				wsUrl,
				publicKey,
				support,
				clientOptions: sharedClientOptions,
				autoConnect,
				defaultMessages: defaultMessages ?? [],
				quickOptions: quickOptions ?? [],
				size,
				defaultOpen,
				onWsConnect,
				onWsDisconnect,
				onWsError,
			}),
		[apiUrl, publicKey, support, wsUrl]
	);
	const controller = externalController ?? ownedController;
	const ownsController = externalController === undefined;
	const pendingOwnedControllerDisposalsRef = React.useRef(
		new Map<SupportController, ReturnType<typeof globalThis.setTimeout>>()
	);

	React.useEffect(() => {
		controller.updateOptions({
			autoConnect,
			defaultMessages: defaultMessages ?? [],
			quickOptions: quickOptions ?? [],
			size,
			defaultOpen,
			onWsConnect,
			onWsDisconnect,
			onWsError,
			support,
		});
	}, [
		autoConnect,
		controller,
		defaultMessages,
		defaultOpen,
		onWsConnect,
		onWsDisconnect,
		onWsError,
		quickOptions,
		size,
		support,
	]);

	React.useEffect(() => {
		const pendingDisposal =
			pendingOwnedControllerDisposalsRef.current.get(controller);

		if (pendingDisposal !== undefined) {
			globalThis.clearTimeout(pendingDisposal);
			pendingOwnedControllerDisposalsRef.current.delete(controller);
		}

		controller.start();
		return () => {
			if (ownsController) {
				const pendingDisposals = pendingOwnedControllerDisposalsRef.current;
				const existingDisposal = pendingDisposals.get(controller);

				if (existingDisposal !== undefined) {
					globalThis.clearTimeout(existingDisposal);
				}

				const timeoutId = globalThis.setTimeout(() => {
					pendingDisposals.delete(controller);
					controller.destroy();
				}, 0);

				pendingDisposals.set(controller, timeoutId);
			}
		};
	}, [controller, ownsController]);

	const snapshot = useStoreSelector(
		controller,
		React.useCallback((state) => state, [])
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
							autoConnect &&
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

/**
 * Convenience hook that exposes the aggregated support context. Throws when it
 * is consumed outside of `SupportProvider` to catch integration mistakes.
 */
export function useSupport(): UseSupportValue {
	const context = useOptionalSupportContext();
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
export type { ConfigurationError };
