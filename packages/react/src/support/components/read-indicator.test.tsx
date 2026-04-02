import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ConversationSeen } from "@plasma/types/schemas";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupportTextResolvedFormatter } from "../text/locales/keys";

type MockAvatarProps = {
	className?: string;
	facehashSeed?: string;
	image?: string | null;
	isAI?: boolean;
	name: string;
	showBackground?: boolean;
};

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: string) => {
		switch (key) {
			case "common.fallbacks.supportTeam":
				return "Support team";
			default:
				throw new Error(`Unexpected text key: ${key}`);
		}
	}) as SupportTextResolvedFormatter;
}

const avatarProps: MockAvatarProps[] = [];
const useSupportTextMock = mock(() => createTextFormatter());

mock.module("../text", () => ({
	useSupportText: useSupportTextMock,
}));

mock.module("./avatar", () => ({
	Avatar: (props: MockAvatarProps) => {
		avatarProps.push(props);

		return React.createElement("div", {
			"data-avatar-class": props.className ?? "",
			"data-avatar-facehash-seed": props.facehashSeed ?? "",
			"data-avatar-image": props.image ?? "",
			"data-avatar-is-ai": props.isAI ? "true" : "false",
			"data-avatar-name": props.name,
			"data-avatar-show-background":
				props.showBackground === undefined
					? ""
					: props.showBackground
						? "true"
						: "false",
		});
	},
}));

const readIndicatorModulePromise = import("./read-indicator");

async function renderReadIndicator({
	availableAIAgents = [],
	availableHumanAgents = [],
	lastReadMessageIds,
	seenData = [],
}: {
	availableAIAgents?: Array<{ id: string; image: string | null; name: string }>;
	availableHumanAgents?: Array<{
		id: string;
		image: string | null;
		lastSeenAt: string | null;
		name: string | null;
	}>;
	lastReadMessageIds: Map<string, string>;
	seenData?: ConversationSeen[];
}): Promise<string> {
	const { ReadIndicator } = await readIndicatorModulePromise;

	return renderToStaticMarkup(
		React.createElement(ReadIndicator, {
			availableAIAgents,
			availableHumanAgents,
			currentVisitorId: "visitor-1",
			lastReadMessageIds,
			messageId: "message-1",
			seenData,
		})
	);
}

beforeEach(() => {
	avatarProps.length = 0;
	useSupportTextMock.mockClear();
});

describe("ReadIndicator", () => {
	it("renders AI readers without a background frame when they have no image", async () => {
		const html = await renderReadIndicator({
			availableAIAgents: [
				{
					id: "ai-1",
					image: null,
					name: "Cossistant",
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
			className: "size-5",
			image: null,
			isAI: true,
			name: "Cossistant",
			showBackground: false,
		});
		expect(html).toContain('data-avatar-show-background="false"');
		expect(html).toContain('title="Seen by Cossistant');
	});

	it("keeps the framed avatar when an AI reader has an image", async () => {
		const html = await renderReadIndicator({
			availableAIAgents: [
				{
					id: "ai-1",
					image: "https://example.com/ai.png",
					name: "Cossistant",
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
			image: "https://example.com/ai.png",
			isAI: true,
			name: "Cossistant",
			showBackground: true,
		});
		expect(html).toContain('data-avatar-show-background="true"');
	});

	it("keeps human read receipts unchanged", async () => {
		const html = await renderReadIndicator({
			availableHumanAgents: [
				{
					id: "user-1",
					image: null,
					lastSeenAt: null,
					name: " Alex ",
				},
			],
			lastReadMessageIds: new Map([["user-1", "message-1"]]),
			seenData: [
				{
					id: "seen-user-1",
					aiAgentId: null,
					conversationId: "conv-1",
					createdAt: "2026-03-09T10:30:00.000Z",
					deletedAt: null,
					lastSeenAt: "2026-03-09T10:30:00.000Z",
					updatedAt: "2026-03-09T10:30:00.000Z",
					userId: "user-1",
					visitorId: null,
				},
			],
		});

		expect(avatarProps).toHaveLength(1);
		expect(avatarProps[0]).toMatchObject({
			className: "size-5",
			facehashSeed: "Alex",
			image: null,
			name: "Alex",
		});
		expect(html).toContain('data-avatar-facehash-seed="Alex"');
		expect(html).toContain('title="Seen by Alex');
	});
});
