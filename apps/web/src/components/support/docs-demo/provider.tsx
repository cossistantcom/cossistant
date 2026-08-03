"use client";

import {
	createSupportStore,
	type RouteRegistry,
} from "@cossistant/core/store/support-store";
import type {
	SupportController,
	SupportControllerSnapshot,
} from "@cossistant/core/support-controller";
import { SupportProvider } from "@cossistant/react/provider";
import * as React from "react";

function createDocsSupportController(): SupportController {
	const supportStore = createSupportStore();
	let defaultMessages: SupportControllerSnapshot["defaultMessages"] = [];
	let quickOptions = [
		"Show me the React API",
		"Can I swap only the home page?",
		"How do slots work?",
	];
	let unreadCount = 2;
	const listeners = new Set<
		(nextSnapshot: SupportControllerSnapshot) => void
	>();

	const website = {
		description: "AI-powered support for modern SaaS teams.",
		domain: "cossistant.com",
		defaultLanguage: "en",
		id: "site_docs_support",
		lastOnlineAt: new Date().toISOString(),
		logoUrl: null,
		name: "Cossistant",
		organizationId: "org_docs_support",
		status: "online",
		availableAIAgents: [
			{
				id: "ai_docs_1",
				name: "Cossistant AI",
				image: null,
			},
		],
		availableHumanAgents: [
			{
				id: "user_docs_1",
				name: "Anthony Riera",
				email: "anthony@example.com",
				image: "https://github.com/rieranthony.png",
				lastSeenAt: new Date().toISOString(),
			},
		],
		visitor: {
			id: "visitor_docs_1",
			language: "en",
			contact: {
				id: "contact_docs_1",
				email: "marc@example.com",
				image: null,
				name: "Marc",
			},
			isBlocked: false,
		},
	} as SupportControllerSnapshot["website"];

	const buildSnapshot = (): SupportControllerSnapshot => {
		const support = supportStore.getState();

		return {
			client: null,
			configurationError: null,
			defaultMessages,
			error: null,
			isLoading: false,
			isOpen: support.config.isOpen,
			isVisitorBlocked: false,
			navigation: support.navigation,
			quickOptions,
			size: support.config.size,
			support,
			unreadCount,
			visitorId: "visitor_docs_1",
			website,
			websiteStatus: "success",
		};
	};

	let snapshot = buildSnapshot();

	const emitChange = () => {
		snapshot = buildSnapshot();
		for (const listener of listeners) {
			listener(snapshot);
		}
	};

	const unsubscribeStore = supportStore.subscribe(() => {
		emitChange();
	});

	return {
		supportStore,
		start: () => {},
		destroy: () => {
			unsubscribeStore();
			listeners.clear();
		},
		getState: () => snapshot,
		getSnapshot: () => snapshot,
		subscribe(listener) {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
		refresh: async () => website,
		updateOptions: () => {},
		updateSupportConfig: (config) => supportStore.updateConfig(config),
		setDefaultMessages: (messages) => {
			defaultMessages = messages;
			emitChange();
		},
		setQuickOptions: (options) => {
			quickOptions = options;
			emitChange();
		},
		setUnreadCount: (count) => {
			unreadCount = count;
			emitChange();
		},
		open: () => supportStore.open(),
		close: () => supportStore.close(),
		toggle: () => supportStore.toggle(),
		navigate: <K extends keyof RouteRegistry>(options: {
			page: K;
			params?: RouteRegistry[K];
		}) => {
			supportStore.navigate(
				options as Parameters<typeof supportStore.navigate>[0]
			);
		},
		replace: <K extends keyof RouteRegistry>(options: {
			page: K;
			params?: RouteRegistry[K];
		}) => {
			supportStore.replace(
				options as Parameters<typeof supportStore.replace>[0]
			);
		},
		goBack: () => supportStore.goBack(),
		goHome: () =>
			supportStore.navigate({
				page: "HOME",
			} as Parameters<typeof supportStore.navigate>[0]),
		openConversation: (conversationId: string) => {
			supportStore.navigate({
				page: "CONVERSATION",
				params: { conversationId },
			} as Parameters<typeof supportStore.navigate>[0]);
			supportStore.open();
		},
		startConversation: (initialMessage?: string) => {
			supportStore.navigate({
				page: "CONVERSATION",
				params: {
					conversationId: "pending_docs_conversation",
					initialMessage,
				},
			} as Parameters<typeof supportStore.navigate>[0]);
			supportStore.open();
		},
		identify: async () => null,
		updateVisitorMetadata: async () => null,
		emit: () => {},
		on: () => () => {},
		off: () => {},
	};
}

export function SupportDocsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const controllerRef = React.useRef<SupportController | null>(null);

	if (!controllerRef.current) {
		controllerRef.current = createDocsSupportController();
	}

	return (
		<SupportProvider controller={controllerRef.current}>
			{children}
		</SupportProvider>
	);
}
