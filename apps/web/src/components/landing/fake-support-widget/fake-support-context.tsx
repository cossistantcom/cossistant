"use client";

import type {
	CossistantContextValue,
	UseSupportValue,
} from "@plasma/react/provider";
import { SupportContext } from "@plasma/react/provider";
import type { PublicWebsiteResponse } from "@plasma/types";
import React from "react";

const ANTHONY_RIERA_ID = "01JGUSER1111111111111111";
const THUMBNAIL_AI_ID = "01JGAIA11111111111111111";
const MARC_VISITOR_ID = "01JGVIS22222222222222222";

// Fake website data
const fakeWebsite: PublicWebsiteResponse = {
	id: "01JGWEB11111111111111111",
	name: "Cossistant",
	domain: "plasma-pandora.com",
	description: "AI-powered customer support",
	logoUrl: null,
	organizationId: "01JGORG11111111111111111",
	status: "active",
	lastOnlineAt: new Date().toISOString(),
	visitor: {
		id: MARC_VISITOR_ID,
		isBlocked: false,
		language: "en-US",
		contact: {
			id: "01JGCON22222222222222222",
			name: "Marc Louvion",
			email: "marc@shipfa.st",
			image: null,
		},
	},
	availableHumanAgents: [
		{
			id: ANTHONY_RIERA_ID,
			name: "Anthony Riera",
			image: "https://github.com/rieranthony.png",
			lastSeenAt: new Date().toISOString(),
		},
	],
	availableAIAgents: [
		{
			id: THUMBNAIL_AI_ID,
			name: "AI",
			image: null,
		},
	],
};

// Fake client (minimal implementation)
const fakeClient = {
	setWebsiteContext: () => {},
	setVisitorBlocked: () => {},
	conversationsStore: {
		getState: () => ({ ids: [], byId: {} }),
	},
	listConversations: async () => [],
} as unknown as CossistantContextValue["client"];

// We need to provide the real SupportContext for the real useSupport() hook.
// Since SupportContext is not exported from @plasma/react/provider,
// we'll create our own context that matches the same structure.
// Real components using useSupport() will look for SupportContext, but
// since it's module-scoped, they won't find our fake one.
//
// The solution: We need to somehow make FakeSupportProvider provide the
// real SupportContext. But we can't import it since it's not exported.
//
// Alternative: Use the real SupportProvider for everything, but that
// defeats the purpose of having a fake provider.
//
// Best solution: Create a wrapper that provides both contexts, or patch
// the module to export SupportContext.
//
// For now, we'll create our own context and see if we can make it work
// by ensuring FakeSupportProvider provides compatible data.
const FakeSupportContext = React.createContext<
	CossistantContextValue | undefined
>(undefined);

type FakeSupportProviderProps = {
	children: React.ReactNode;
};

/**
 * Fake support provider that mimics SupportProvider but provides fake data.
 * Provides the real SupportContext structure so real hooks can work.
 */
export function FakeSupportProvider({
	children,
}: FakeSupportProviderProps): React.ReactElement {
	const [unreadCount, setUnreadCount] = React.useState(0);

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

	// Provide both our fake context (for useFakeSupport) and the real SupportContext
	// (for real hooks like useSupport() used by SupportTextProvider)
	return (
		<FakeSupportContext.Provider value={value}>
			<SupportContext.Provider value={value}>
				{children}
			</SupportContext.Provider>
		</FakeSupportContext.Provider>
	);
}

/**
 * Fake version of useSupport hook that returns fake context data.
 * This is for our fake components. Real components should use the real useSupport()
 * hook, but they'll need the real SupportContext which we can't provide directly.
 */
export function useFakeSupport(): UseSupportValue {
	const context = React.useContext(FakeSupportContext);
	if (!context) {
		throw new Error("useFakeSupport must be used within FakeSupportProvider");
	}

	const availableHumanAgents = context.website?.availableHumanAgents || [];
	const availableAIAgents = context.website?.availableAIAgents || [];
	const visitorLanguage = context.website?.visitor?.language || null;

	// Create visitor object with normalized locale
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
