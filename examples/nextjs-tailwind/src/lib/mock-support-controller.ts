import {
	createSupportStore,
	PENDING_SUPPORT_CONVERSATION_ID,
	type RouteRegistry,
	type SupportController,
	type SupportControllerSnapshot,
} from "@cossistant/core";

export function createMockSupportController(): SupportController {
	const supportStore = createSupportStore();
	let defaultMessages: SupportControllerSnapshot["defaultMessages"] = [
		{
			content: "Hi, how can we help you test Cossistant today?",
			senderType: "team_member",
		},
	];
	let quickOptions: string[] = [
		"Check widget placement",
		"Open the custom page",
		"Verify integration tests",
	];
	let unreadCount = 0;
	const listeners = new Set<
		(controllerSnapshot: SupportControllerSnapshot) => void
	>();

	const website = {
		description: "Deterministic example website for SDK integration tests.",
		domain: "example.cossistant.test",
		defaultLanguage: "en",
		id: "site_example",
		lastOnlineAt: null,
		logoUrl: null,
		name: "Cossistant Example",
		organizationId: "org_example",
		status: "online",
		availableAIAgents: [],
		availableHumanAgents: [],
		visitor: {
			id: "visitor_example",
			language: "en",
			contact: {
				id: "contact_example",
				createdAt: "2026-01-01T00:00:00.000Z",
				email: "demo@cossistant.com",
				externalId: "user_example",
				image: null,
				lastSeenAt: "2026-01-01T00:00:00.000Z",
				metadata: {},
				name: "Demo User",
				organizationId: "org_example",
				updatedAt: "2026-01-01T00:00:00.000Z",
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
			visitorId: website?.visitor?.id ?? null,
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

	const unsubscribeStore = supportStore.subscribe(emitChange);

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
		goHome: () => supportStore.navigate({ page: "HOME" }),
		openConversation: (conversationId) => {
			supportStore.navigate({
				page: "CONVERSATION",
				params: { conversationId },
			});
			supportStore.open();
		},
		startConversation: (initialMessage) => {
			supportStore.navigate({
				page: "CONVERSATION",
				params: {
					conversationId: PENDING_SUPPORT_CONVERSATION_ID,
					initialMessage,
				},
			});
			supportStore.open();
		},
		identify: async () => null,
		updateVisitorMetadata: async () => null,
		emit: () => {},
		on: () => () => {},
		off: () => {},
	};
}
