import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type Conversation, ConversationStatus } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupportTextResolvedFormatter } from "../support/text/locales/keys";

type SupportState = {
	availableHumanAgents: Array<{
		id: string;
		name: string | null;
		image: string | null;
		lastSeenAt: string | null;
	}>;
	availableAIAgents: Array<{
		id: string;
		name: string;
		image: string | null;
	}>;
	visitor: {
		id: string;
		contact: null;
	};
};

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: string, variables?: Record<string, string>) => {
		switch (key) {
			case "common.fallbacks.unknown":
				return "Unknown";
			case "common.fallbacks.you":
				return "You";
			case "common.fallbacks.supportTeam":
				return "Support team";
			case "common.fallbacks.aiAssistant":
				return "AI Assistant";
			case "component.conversationButtonLink.fallbackTitle":
				return "Conversation";
			case "component.conversationButtonLink.typing":
				return `${variables?.name ?? "Someone"} is typing...`;
			default:
				throw new Error(`Unexpected text key: ${key}`);
		}
	}) as SupportTextResolvedFormatter;
}

const useSupportMock = mock(() => currentSupportState);
const useSupportTextMock = mock(() => createTextFormatter());
const useConversationTimelineItemsMock = mock(() => ({
	items: currentTimelineItems,
}));
const useConversationTypingMock = mock(() => []);

mock.module("../provider", () => ({
	useSupport: useSupportMock,
}));

mock.module("../support/text", () => ({
	useSupportText: useSupportTextMock,
}));

mock.module("./use-conversation-timeline-items", () => ({
	useConversationTimelineItems: useConversationTimelineItemsMock,
}));

mock.module("./use-conversation-typing", () => ({
	useConversationTyping: useConversationTypingMock,
}));

const useConversationPreviewModulePromise = import(
	"./use-conversation-preview"
);

const baseConversation: Conversation = {
	id: "conversation-1",
	createdAt: "2026-03-07T00:00:00.000Z",
	updatedAt: "2026-03-07T00:00:00.000Z",
	visitorId: "visitor-1",
	websiteId: "website-1",
	status: ConversationStatus.OPEN,
	deletedAt: null,
	title: "Need help",
};

let currentSupportState: SupportState;
let currentTimelineItems: TimelineItem[];

function createMessageItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id: "item-1",
		conversationId: "conversation-1",
		organizationId: "org-1",
		type: "message",
		text: "Hello from support",
		parts: [{ type: "text", text: "Hello from support" }],
		visibility: "public",
		userId: "human-1",
		visitorId: null,
		aiAgentId: null,
		createdAt: "2026-03-07T01:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

async function renderPreview(conversation: Conversation) {
	const { useConversationPreview } = await useConversationPreviewModulePromise;
	let result: ReturnType<typeof useConversationPreview> | null = null;

	function Harness() {
		result = useConversationPreview({ conversation });
		return null;
	}

	renderToStaticMarkup(React.createElement(Harness));
	return result;
}

describe("useConversationPreview", () => {
	beforeEach(() => {
		currentSupportState = {
			availableHumanAgents: [],
			availableAIAgents: [],
			visitor: {
				id: "visitor-1",
				contact: null,
			},
		};
		currentTimelineItems = [];

		useSupportMock.mockClear();
		useSupportTextMock.mockClear();
		useConversationTimelineItemsMock.mockClear();
		useConversationTypingMock.mockClear();
	});

	it("uses Support team and a stable seed when the assigned human has a blank name", async () => {
		currentSupportState = {
			...currentSupportState,
			availableHumanAgents: [
				{
					id: "human-1",
					name: "   ",
					image: null,
					lastSeenAt: null,
				},
			],
		};
		const conversation = {
			...baseConversation,
			lastTimelineItem: createMessageItem(),
		};

		const preview = await renderPreview(conversation);

		expect(preview?.lastMessage?.senderName).toBe("Support team");
		expect(preview?.assignedAgent).toEqual({
			type: "human",
			name: "Support team",
			facehashSeed: "public:human-1",
			image: null,
			lastSeenAt: null,
		});
	});

	it("derives the facehash seed from the timeline userId when the human roster entry is missing", async () => {
		const conversation = {
			...baseConversation,
			lastTimelineItem: createMessageItem({
				id: "item-404",
				userId: "human-404",
			}),
		};

		const preview = await renderPreview(conversation);

		expect(preview?.assignedAgent).toEqual({
			type: "human",
			name: "Support team",
			facehashSeed: "public:human-404",
			image: null,
			lastSeenAt: null,
		});
	});

	it("ignores AI typing for visitor-facing preview state", async () => {
		currentSupportState = {
			...currentSupportState,
			availableAIAgents: [
				{
					id: "ai-1",
					name: "Helper AI",
					image: null,
				},
			],
		};
		useConversationTypingMock.mockReturnValue([
			{
				actorType: "ai_agent",
				actorId: "ai-1",
				preview: null,
				updatedAt: 1,
			},
		]);

		const preview = await renderPreview(baseConversation);

		expect(preview?.typing).toEqual({
			participants: [],
			primaryParticipant: null,
			label: null,
			isTyping: false,
		});
	});
});
