import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { RouterOutputs } from "@api/trpc/types";
import type { ConversationSeen } from "@cossistant/types/schemas";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type MockAvatarProps = {
	className?: string;
	facehashSeed?: string;
	fallbackName: string;
	url?: string | null;
};

const avatarProps: MockAvatarProps[] = [];
let logoRenderCount = 0;

mock.module("@/components/ui/avatar", () => ({
	Avatar: (props: MockAvatarProps) => {
		avatarProps.push(props);

		return React.createElement("div", {
			"data-avatar-class": props.className ?? "",
			"data-avatar-facehash-seed": props.facehashSeed ?? "",
			"data-avatar-fallback": props.fallbackName,
			"data-avatar-url": props.url ?? "",
		});
	},
}));

mock.module("@/components/ui/logo", () => ({
	Logo: (props: { className?: string }) => {
		logoRenderCount += 1;

		return React.createElement("div", {
			"data-logo-class": props.className ?? "",
			"data-slot": "mock-logo",
		});
	},
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) =>
		React.createElement(React.Fragment, null, children),
}));

mock.module("motion/react", () => ({
	motion: {
		div: ({
			layoutId: _layoutId,
			...props
		}: React.HTMLAttributes<HTMLDivElement> & {
			layoutId?: string;
		}) => React.createElement("div", props),
	},
}));

mock.module("@cossistant/next/primitives", () => ({
	resolveTimelineReadReceiptReaders: ({
		currentViewerId,
		lastReadItemIds,
		resolveParticipant,
		seenData = [],
	}: {
		currentViewerId?: string;
		lastReadItemIds?: Map<string, string>;
		resolveParticipant: (params: {
			actorType: "ai_agent" | "user" | "visitor";
			id: string;
		}) => unknown;
		seenData?: ConversationSeen[];
	}) => {
		const readers = seenData
			.map((entry) => {
				const id = entry.aiAgentId ?? entry.userId ?? entry.visitorId;
				if (!id || id === currentViewerId) {
					return null;
				}

				if (lastReadItemIds && lastReadItemIds.get(id) !== "message-1") {
					return null;
				}

				const actorType = entry.aiAgentId
					? "ai_agent"
					: entry.userId
						? "user"
						: "visitor";
				const participant = resolveParticipant({ actorType, id });

				if (!participant) {
					return null;
				}

				return {
					id,
					lastSeenAt: entry.lastSeenAt,
					participant,
				};
			})
			.filter((reader) => reader !== null);

		return { readers };
	},
}));

const readIndicatorModulePromise = import("./read-indicator");

async function renderReadIndicator({
	availableAIAgents = [],
	lastReadMessageIds,
	seenData = [],
}: {
	availableAIAgents?: Array<{ id: string; image: string | null; name: string }>;
	lastReadMessageIds: Map<string, string>;
	seenData?: ConversationSeen[];
}): Promise<string> {
	const { ReadIndicator } = await readIndicatorModulePromise;

	return renderToStaticMarkup(
		React.createElement(ReadIndicator, {
			availableAIAgents,
			currentUserId: "user-1",
			firstMessage: undefined,
			lastReadMessageIds,
			messageId: "message-1",
			messages: [],
			seenData,
			teamMembers: [] as unknown as RouterOutputs["user"]["getWebsiteMembers"],
			visitor: {
				id: "visitor-1",
				lastSeenAt: null,
				blockedAt: null,
				blockedByUserId: null,
				isBlocked: false,
				contact: {
					id: "contact-1",
					name: "Marc",
					email: "marc@example.com",
					image: null,
				},
			},
		})
	);
}

beforeEach(() => {
	avatarProps.length = 0;
	logoRenderCount = 0;
});

describe("Dashboard ReadIndicator", () => {
	it("renders the AI reader image instead of the default logo when present", async () => {
		const html = await renderReadIndicator({
			availableAIAgents: [
				{
					id: "ai-1",
					image: "https://cdn.example.com/ai-agent.png",
					name: "Support AI",
				},
			],
			lastReadMessageIds: new Map([["ai-1", "message-1"]]),
			seenData: [
				{
					id: "seen-ai-1",
					aiAgentId: "ai-1",
					conversationId: "conv-1",
					createdAt: "2026-03-09T10:30:00.000Z",
					deletedAt: null,
					lastSeenAt: "2026-03-09T10:30:00.000Z",
					updatedAt: "2026-03-09T10:30:00.000Z",
					userId: null,
					visitorId: null,
				},
			],
		});

		expect(avatarProps).toHaveLength(1);
		expect(avatarProps[0]).toMatchObject({
			className: "size-5 rounded border border-background",
			fallbackName: "Support AI",
			url: "https://cdn.example.com/ai-agent.png",
		});
		expect(logoRenderCount).toBe(0);
		expect(html).toContain(
			'data-avatar-url="https://cdn.example.com/ai-agent.png"'
		);
		expect(html).not.toContain('data-slot="mock-logo"');
	});

	it("falls back to the default logo when the AI reader has no image", async () => {
		const html = await renderReadIndicator({
			availableAIAgents: [
				{
					id: "ai-1",
					image: null,
					name: "Support AI",
				},
			],
			lastReadMessageIds: new Map([["ai-1", "message-1"]]),
			seenData: [
				{
					id: "seen-ai-1",
					aiAgentId: "ai-1",
					conversationId: "conv-1",
					createdAt: "2026-03-09T10:30:00.000Z",
					deletedAt: null,
					lastSeenAt: "2026-03-09T10:30:00.000Z",
					updatedAt: "2026-03-09T10:30:00.000Z",
					userId: null,
					visitorId: null,
				},
			],
		});

		expect(avatarProps).toHaveLength(0);
		expect(logoRenderCount).toBe(1);
		expect(html).toContain('data-slot="mock-logo"');
	});
});
