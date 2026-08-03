"use client";

import type { SupportController } from "@cossistant/core";
import { createSupportStore } from "@cossistant/core/store/support-store";
import { SupportControllerContext } from "@cossistant/react/controller-context";
import type {
	CossistantContextValue,
	UseSupportValue,
} from "@cossistant/react/provider";
import { SupportContext } from "@cossistant/react/provider";
import type { PublicWebsiteResponse } from "@cossistant/types";
import React from "react";

const TEST_UI_TEAM_MEMBER_ID = "01JGUSER1111111111111111";
const TEST_UI_AI_AGENT_ID = "01JGAIA11111111111111111";
const TEST_UI_VISITOR_ID = "01JGVIS22222222222222222";
const TEST_UI_CONTACT_ID = "01JGCON22222222222222222";

const fakeWebsite: PublicWebsiteResponse = {
	id: "01JGWEB11111111111111111",
	name: "Cossistant",
	domain: "cossistant.com",
	description: "AI-powered customer support",
	logoUrl: null,
	organizationId: "01JGORG11111111111111111",
	defaultLanguage: "en",
	status: "active",
	lastOnlineAt: "2026-04-14T10:00:00.000Z",
	visitor: {
		id: TEST_UI_VISITOR_ID,
		isBlocked: false,
		language: "en-US",
		contact: null,
	},
	availableHumanAgents: [
		{
			id: TEST_UI_TEAM_MEMBER_ID,
			name: "Anthony Riera",
			email: "anthony@example.com",
			image: "https://github.com/rieranthony.png",
			lastSeenAt: "2026-04-14T09:58:00.000Z",
		},
	],
	availableAIAgents: [
		{
			id: TEST_UI_AI_AGENT_ID,
			name: "Cossistant AI",
			image: null,
		},
	],
};

const fakeClient = {
	setWebsiteContext: () => {},
	setVisitorBlocked: () => {},
	conversationsStore: {
		getState: () => ({ ids: [], byId: {} }),
	},
	listConversations: async () => [],
	sendMessage: async () => null,
	fetchWebsite: async () => fakeWebsite,
} as unknown as CossistantContextValue["client"];

const FakeSupportContext = React.createContext<
	CossistantContextValue | undefined
>(undefined);

export function FakeSupportProvider({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	const [unreadCount, setUnreadCount] = React.useState(0);
	const fakeController = React.useMemo<SupportController>(() => {
		const supportStore = createSupportStore();

		// useSyncExternalStore requires getSnapshot to return a stable reference
		// between store changes. Rebuilding this object on every call makes React
		// see a new snapshot on every render and bail out with "Maximum update
		// depth exceeded". The real controller caches its snapshot and rebuilds it
		// only when state changes (see syncSnapshot in @cossistant/core); mirror
		// that here, and forward store changes to subscribers so updates still
		// reach React.
		const buildSnapshot = () => {
			const support = supportStore.getState();

			return {
				client: fakeClient,
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
				unreadCount,
				visitorId: TEST_UI_VISITOR_ID,
				website: fakeWebsite,
				websiteStatus: "success",
			};
		};

		let snapshot = buildSnapshot();
		const listeners = new Set<() => void>();

		supportStore.subscribe(() => {
			snapshot = buildSnapshot();
			for (const listener of listeners) {
				listener();
			}
		});

		return {
			supportStore,
			start: () => {},
			destroy: () => {},
			getState: () => snapshot,
			getSnapshot: () => snapshot,
			subscribe: (listener: () => void) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			refresh: async () => fakeWebsite,
			updateOptions: (
				_options: Parameters<SupportController["updateOptions"]>[0]
			) => {},
			updateSupportConfig: (
				config: Parameters<SupportController["updateSupportConfig"]>[0]
			) => supportStore.updateConfig(config),
			setDefaultMessages: () => {},
			setQuickOptions: (
				_options: Parameters<SupportController["setQuickOptions"]>[0]
			) => {},
			setUnreadCount,
			open: () => supportStore.open(),
			close: () => supportStore.close(),
			toggle: () => supportStore.toggle(),
			navigate: (options: Parameters<SupportController["navigate"]>[0]) =>
				supportStore.navigate(options as never),
			replace: (options: Parameters<SupportController["replace"]>[0]) =>
				supportStore.replace(options as never),
			goBack: () => supportStore.goBack(),
			goHome: () => supportStore.navigate({ page: "HOME" } as never),
			openConversation: () => {},
			startConversation: () => {},
			identify: async () => ({
				contact: {
					id: TEST_UI_CONTACT_ID,
				},
				visitorId: TEST_UI_VISITOR_ID,
			}),
			updateVisitorMetadata: async () => null,
			emit: () => {},
			on: () => () => {},
			off: () => {},
		} as unknown as SupportController;
	}, [unreadCount]);

	const value = React.useMemo<CossistantContextValue>(
		() => ({
			website: fakeWebsite,
			unreadCount,
			setUnreadCount,
			isLoading: false,
			error: null,
			configurationError: null,
			client: fakeClient,
			defaultMessages: [],
			setDefaultMessages: () => {},
			quickOptions: [],
			setQuickOptions: () => {},
			isOpen: true,
			open: () => {},
			close: () => {},
			toggle: () => {},
		}),
		[unreadCount]
	);

	return (
		<FakeSupportContext.Provider value={value}>
			<SupportControllerContext.Provider value={fakeController}>
				<SupportContext.Provider value={value}>
					{children}
				</SupportContext.Provider>
			</SupportControllerContext.Provider>
		</FakeSupportContext.Provider>
	);
}

export function useFakeSupport(): UseSupportValue {
	const context = React.useContext(FakeSupportContext);
	if (!context) {
		throw new Error("useFakeSupport must be used within FakeSupportProvider");
	}

	const availableHumanAgents = context.website?.availableHumanAgents || [];
	const availableAIAgents = context.website?.availableAIAgents || [];
	const visitorLanguage = context.website?.visitor?.language || null;
	const visitor = context.website?.visitor
		? {
				...context.website.visitor,
				locale: visitorLanguage || "en",
			}
		: undefined;

	return {
		...context,
		availableHumanAgents,
		availableAIAgents,
		visitor,
		size: "normal",
	};
}
