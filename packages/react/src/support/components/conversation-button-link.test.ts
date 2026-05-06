import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { type Conversation, ConversationStatus } from "@cossistant/types";
import { Facehash } from "facehash";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupportTextResolvedFormatter } from "../text/locales/keys";

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: string, variables?: Record<string, string>) => {
		switch (key) {
			case "component.conversationButtonLink.lastMessage.visitor":
				return `You - ${variables?.time ?? ""}`;
			case "component.conversationButtonLink.lastMessage.agent":
				return `${variables?.name ?? ""} - ${variables?.time ?? ""}`;
			case "component.conversationButtonLink.status.open":
				return "open";
			case "component.conversationButtonLink.status.resolved":
				return "resolved";
			case "component.conversationButtonLink.status.spam":
				return "spam";
			case "component.conversationButtonLink.status.closed":
				return "closed";
			case "common.fallbacks.unknown":
				return "Unknown";
			case "common.fallbacks.supportTeam":
				return "Support Team";
			default:
				throw new Error(`Unexpected text key: ${key}`);
		}
	}) as SupportTextResolvedFormatter;
}

const text = createTextFormatter();
let currentPreview: unknown;

const useConversationPreviewMock = mock(() => currentPreview);
const useSupportTextMock = mock(() => text);

mock.module("../../hooks/use-conversation-preview", () => ({
	useConversationPreview: useConversationPreviewMock,
}));

mock.module("../text", () => ({
	useSupportText: useSupportTextMock,
}));

mock.module("./avatar", () => ({
	Avatar: ({ name, facehashName }: { name: string; facehashName?: string }) =>
		React.createElement(
			"div",
			{
				"data-avatar": name,
				"data-facehash-name": facehashName ?? "",
			},
			React.createElement(Facehash, {
				className: "size-full text-black",
				interactive: false,
				name: facehashName ?? name,
				size: "100%",
			})
		),
}));

mock.module("./icons", () => ({
	default: ({ name }: { name: string }) =>
		React.createElement("svg", {
			"data-icon": name,
		}),
}));

const conversationButtonLinkModulePromise = import(
	"./conversation-button-link"
);

const baseConversation: Conversation = {
	id: "conversation-1",
	createdAt: "2026-03-07T00:00:00.000Z",
	updatedAt: "2026-03-07T00:00:00.000Z",
	visitorId: "visitor-1",
	websiteId: "website-1",
	channel: "widget",
	status: ConversationStatus.OPEN,
	deletedAt: null,
	title: "you here?",
};

function createPreview(overrides: Record<string, unknown> = {}) {
	return {
		title: "you here?",
		lastMessage: {
			content: "Can you help me with my invoice?",
			time: "5m",
			isFromVisitor: true,
			senderName: "You",
		},
		assignedAgent: {
			name: "Support Agent",
			image: null,
			type: "human",
			lastSeenAt: null,
		},
		typing: {
			participants: [],
			primaryParticipant: null,
			label: null,
			isTyping: false,
		},
		...overrides,
	};
}

async function renderConversationButtonLink(
	conversation: Conversation = baseConversation
): Promise<string> {
	const { ConversationButtonLink } = await conversationButtonLinkModulePromise;

	return renderToStaticMarkup(
		React.createElement(ConversationButtonLink, {
			conversation,
		})
	);
}

beforeEach(() => {
	currentPreview = createPreview();
	useConversationPreviewMock.mockClear();
	useSupportTextMock.mockClear();
});

afterAll(() => {
	mock.restore();
});

describe("resolveConversationButtonPreviewSelection", () => {
	it("uses visitor metadata when the title and message preview are identical", async () => {
		const { resolveConversationButtonPreviewSelection } =
			await conversationButtonLinkModulePromise;
		const result = resolveConversationButtonPreviewSelection({
			title: "Need help with billing",
			lastMessage: {
				content: "Need help with billing",
				time: "2m",
				isFromVisitor: true,
				senderName: "You",
			},
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			showTitle: true,
			subtitle: "You - 2m",
			showTyping: false,
		});
	});

	it("keeps the last message when it differs from the title", async () => {
		const { resolveConversationButtonPreviewSelection } =
			await conversationButtonLinkModulePromise;
		const result = resolveConversationButtonPreviewSelection({
			title: "Billing issue",
			lastMessage: {
				content: "Can you help me with my invoice?",
				time: "5m",
				isFromVisitor: true,
				senderName: "You",
			},
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			showTitle: true,
			subtitle: "Can you help me with my invoice?",
			showTyping: false,
		});
	});

	it("shows the review preview when the latest visitor action is feedback", async () => {
		const { resolveConversationButtonPreviewSelection } =
			await conversationButtonLinkModulePromise;
		const result = resolveConversationButtonPreviewSelection({
			title: "The drawer closes unexpectedly",
			lastMessage: {
				content: "The drawer closes unexpectedly",
				time: "1m",
				isFromVisitor: true,
				isFeedbackReview: true,
				senderName: "You",
			},
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			showTitle: true,
			subtitle: "You left a review",
			showTyping: false,
		});
	});

	it("normalizes whitespace before deciding content is duplicated", async () => {
		const { resolveConversationButtonPreviewSelection } =
			await conversationButtonLinkModulePromise;
		const result = resolveConversationButtonPreviewSelection({
			title: "Need   help   with billing",
			lastMessage: {
				content: "Need help with billing",
				time: "1h",
				isFromVisitor: false,
				senderName: "Alice",
			},
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			showTitle: true,
			subtitle: "Alice - 1h",
			showTyping: false,
		});
	});

	it("renders no subtitle when there is no last message", async () => {
		const { resolveConversationButtonPreviewSelection } =
			await conversationButtonLinkModulePromise;
		const result = resolveConversationButtonPreviewSelection({
			title: "Untitled conversation",
			lastMessage: null,
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			showTitle: true,
			subtitle: null,
			showTyping: false,
		});
	});

	it("keeps typing as the highest-priority preview state", async () => {
		const { resolveConversationButtonPreviewSelection } =
			await conversationButtonLinkModulePromise;
		const result = resolveConversationButtonPreviewSelection({
			title: "Billing issue",
			lastMessage: {
				content: "Can you help me with my invoice?",
				time: "5m",
				isFromVisitor: true,
				senderName: "You",
			},
			isTyping: true,
			text,
		});

		expect(result).toEqual({
			showTitle: false,
			subtitle: null,
			showTyping: true,
		});
	});
});

describe("ConversationButtonLink", () => {
	it("renders only typing dots in the text block while keeping the row shell", async () => {
		currentPreview = createPreview({
			typing: {
				participants: [{ id: "agent-1", type: "team_member" }],
				primaryParticipant: {
					id: "agent-1",
					type: "team_member",
					name: "Support Agent",
					image: null,
				},
				label: "Support Agent is typing...",
				isTyping: true,
			},
		});

		const html = await renderConversationButtonLink();

		expect(html).toContain("dot-bounce-1");
		expect(html).toContain('data-avatar="Support Agent"');
		expect(html).toContain('data-icon="arrow-right"');
		expect(html).not.toContain("you here?");
		expect(html).not.toContain("Can you help me with my invoice?");
	});

	it("keeps the normal title and subtitle when typing is inactive", async () => {
		const html = await renderConversationButtonLink();

		expect(html).toContain("you here?");
		expect(html).toContain("Can you help me with my invoice?");
		expect(html).not.toContain("dot-bounce-1");
	});

	it("forwards the preview Facehash name to the avatar", async () => {
		currentPreview = createPreview({
			assignedAgent: {
				name: "Support Team",
				facehashName: "support@example.com",
				image: null,
				type: "human",
				lastSeenAt: null,
			},
		});

		const html = await renderConversationButtonLink();

		expect(html).toContain('data-avatar="Support Team"');
		expect(html).toContain('data-facehash-name="support@example.com"');
	});

	it("keeps the nested facehash scene full-size inside the conversation button", async () => {
		const html = await renderConversationButtonLink();

		expect(html).toContain("group/btn");
		expect(html).toContain(
			"display:block;overflow:visible;color:inherit;width:100%;height:100%"
		);
	});
});
