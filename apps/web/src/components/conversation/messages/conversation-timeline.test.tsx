import { beforeEach, describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const useConversationTypingMock = mock(
	(): Array<{
		actorType: "visitor" | "user" | "ai_agent";
		actorId: string;
		preview: string | null;
		updatedAt: number;
	}> => []
);

mock.module("@cossistant/react", () => ({
	useConversationTyping: useConversationTypingMock,
	useSupport: () => ({}),
}));

mock.module("@cossistant/next/hooks", () => ({
	useGroupedMessages: () => ({
		items: [],
		lastReadMessageMap: {},
	}),
}));

mock.module("@cossistant/next/primitives", () => ({
	ConversationTimeline: ({
		children,
		autoScroll: _autoScroll,
		items: _items,
		maskHeight: _maskHeight,
		onScrollStart: _onScrollStart,
		...props
	}: React.HTMLAttributes<HTMLDivElement> & {
		children: React.ReactNode;
		autoScroll?: boolean;
		items?: unknown[];
		maskHeight?: string;
		onScrollStart?: () => void;
	}) => <div {...props}>{children}</div>,
	ConversationTimelineContainer: ({
		children,
		...props
	}: React.HTMLAttributes<HTMLDivElement> & {
		children: React.ReactNode;
	}) => <div {...props}>{children}</div>,
	DaySeparator: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DaySeparatorLabel: ({
		children,
		formattedDate,
	}: {
		children?: React.ReactNode;
		formattedDate?: string;
	}) => <div>{children ?? formattedDate}</div>,
	DaySeparatorLine: (props: React.HTMLAttributes<HTMLDivElement>) => (
		<div {...props} />
	),
	TimelineItemGroupAvatar: ({
		children,
		...props
	}: {
		children: React.ReactNode;
	}) => <div {...props}>{children}</div>,
	TimelineItemGroupContent: ({
		children,
		...props
	}: {
		children: React.ReactNode;
	}) => <div {...props}>{children}</div>,
	TimelineItemGroupHeader: ({
		children,
		...props
	}: {
		children: React.ReactNode;
	}) => <div {...props}>{children}</div>,
}));

mock.module("motion/react", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	motion: {
		div: ({
			children,
			...props
		}: React.HTMLAttributes<HTMLDivElement> & {
			children: React.ReactNode;
		}) => <div {...props}>{children}</div>,
	},
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({
		fallbackName,
		lastOnlineAt: _lastOnlineAt,
		...props
	}: React.HTMLAttributes<HTMLDivElement> & {
		fallbackName: string;
		lastOnlineAt?: string | null;
	}) => (
		<div data-fallback-name={fallbackName} data-slot="avatar" {...props}>
			{fallbackName}
		</div>
	),
}));

mock.module("@/components/ui/logo", () => ({
	Logo: (props: React.HTMLAttributes<HTMLDivElement>) => (
		<div data-slot="logo" {...props} />
	),
}));

mock.module("@/contexts/visitor-presence", () => ({
	useVisitorPresenceById: () => null,
}));

mock.module("@/contexts/website", () => ({
	useWebsite: () => ({
		slug: "acme",
	}),
}));

mock.module("@/hooks/use-conversation-developer-mode", () => ({
	useConversationDeveloperMode: () => false,
}));

mock.module("@/hooks/use-dashboard-typing-sound", () => ({
	useDashboardTypingSound: () => {},
}));

mock.module("@/hooks/use-sound-preferences", () => ({
	useSoundPreferences: () => ({
		typingEnabled: false,
	}),
}));

mock.module("./dashboard-timeline-render-items", () => ({
	buildDashboardTimelineRenderItems: () => [],
	buildPublicActivityGroupFromTool: () => ({
		type: "activity_group",
		items: [],
	}),
}));

mock.module("./developer-log-group", () => ({
	DeveloperLogGroup: () => null,
}));

mock.module("./event", () => ({
	ConversationEvent: () => null,
}));

mock.module("./timeline-activity-group", () => ({
	TimelineActivityGroup: () => null,
}));

mock.module("./timeline-message-group", () => ({
	TimelineMessageGroup: () => null,
}));

const modulePromise = import("./conversation-timeline");

async function renderTimeline(
	options: {
		availableAIAgents?: Array<{
			id: string;
			name: string;
			image: string | null;
		}>;
	} = {}
) {
	const { ConversationTimelineList } = await modulePromise;

	return renderToStaticMarkup(
		<ConversationTimelineList
			availableAIAgents={options.availableAIAgents ?? []}
			conversationId="conv-1"
			currentUserId="user-1"
			items={[]}
			teamMembers={[]}
			visitor={
				{
					id: "visitor-1",
					contact: {
						name: "Marc",
						email: "marc@example.com",
						image: null,
					},
				} as never
			}
		/>
	);
}

describe("ConversationTimelineList typing indicator", () => {
	beforeEach(() => {
		useConversationTypingMock.mockClear();
		useConversationTypingMock.mockReturnValue([]);
	});

	it("renders visitor typing previews in the conversation pane", async () => {
		useConversationTypingMock.mockReturnValue([
			{
				actorType: "visitor",
				actorId: "visitor-1",
				preview: "Hello from the visitor",
				updatedAt: 1,
			},
		]);

		const html = await renderTimeline();

		expect(useConversationTypingMock).toHaveBeenCalledWith("conv-1", {
			excludeUserId: "user-1",
		});
		expect(html).toContain("Marc live typing");
		expect(html).toContain("Hello from the visitor");
	});

	it("renders AI typing indicators in the conversation pane", async () => {
		useConversationTypingMock.mockReturnValue([
			{
				actorType: "ai_agent",
				actorId: "ai-1",
				preview: null,
				updatedAt: 1,
			},
		]);

		const html = await renderTimeline({
			availableAIAgents: [
				{
					id: "ai-1",
					name: "Answer Bot",
					image: null,
				},
			],
		});

		expect(html).toContain("Answer Bot is thinking...");
	});
});
