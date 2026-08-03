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
import type {
	SubmitFeedbackRequest,
	SubmitFeedbackResponse,
} from "@cossistant/types/api/feedback";
import * as React from "react";

function createFeedbackResponse(
	request: SubmitFeedbackRequest
): SubmitFeedbackResponse {
	const timestamp = new Date().toISOString();

	return {
		feedback: {
			id: "feedback_docs_1",
			organizationId: "org_docs_feedback",
			websiteId: "site_docs_feedback",
			conversationId: request.conversationId ?? null,
			visitorId: request.visitorId ?? "visitor_docs_feedback",
			contactId: request.contactId ?? "contact_docs_feedback",
			rating: request.rating,
			topic: request.topic ?? null,
			comment: request.comment ?? null,
			trigger: request.trigger ?? null,
			source: request.source ?? "widget",
			createdAt: timestamp,
			updatedAt: timestamp,
		},
	};
}

function createFeedbackDocsController(): SupportController {
	const supportStore = createSupportStore();
	const listeners = new Set<
		(nextSnapshot: SupportControllerSnapshot) => void
	>();
	const client = {
		submitFeedback: async (request: SubmitFeedbackRequest) =>
			createFeedbackResponse(request),
	} as SupportControllerSnapshot["client"];
	const website = {
		description: "AI-powered support for modern SaaS teams.",
		domain: "cossistant.com",
		defaultLanguage: "en",
		id: "site_docs_feedback",
		lastOnlineAt: new Date().toISOString(),
		logoUrl: null,
		name: "Cossistant",
		organizationId: "org_docs_feedback",
		status: "online",
		availableAIAgents: [],
		availableHumanAgents: [],
		visitor: {
			id: "visitor_docs_feedback",
			language: "en",
			contact: {
				id: "contact_docs_feedback",
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
			client,
			configurationError: null,
			defaultMessages: [],
			error: null,
			isLoading: false,
			isOpen: support.config.isOpen,
			isVisitorBlocked: false,
			navigation: support.navigation,
			quickOptions: [],
			size: support.config.size,
			support,
			unreadCount: 0,
			visitorId: "visitor_docs_feedback",
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
		setDefaultMessages: () => {},
		setQuickOptions: () => {},
		setUnreadCount: () => {},
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
					conversationId: "pending_docs_feedback_conversation",
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

export function UserFeedbackDocsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const controllerRef = React.useRef<SupportController | null>(null);

	if (!controllerRef.current) {
		controllerRef.current = createFeedbackDocsController();
	}

	return (
		<SupportProvider controller={controllerRef.current}>
			{children}
		</SupportProvider>
	);
}
