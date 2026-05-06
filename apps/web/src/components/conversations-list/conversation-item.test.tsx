import { afterAll, describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({
		className,
		fallbackName,
	}: {
		className?: string;
		fallbackName: string;
	}) => (
		<div
			className={className}
			data-fallback-name={fallbackName}
			data-slot="avatar"
		/>
	),
}));

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({
		children,
		content,
	}: {
		children: React.ReactNode;
		content?: React.ReactNode;
	}) => (
		<div data-slot="mock-tooltip" data-tooltip-content={String(content ?? "")}>
			{children}
		</div>
	),
}));

const modulePromise = import("./conversation-item");

async function renderView(props: Record<string, unknown> = {}) {
	const { ConversationItemView } = await modulePromise;

	return renderToStaticMarkup(
		<ConversationItemView
			hasUnreadMessage={false}
			isTyping={false}
			lastTimelineContent={<span>Hello</span>}
			visitorName="Gorgeous Wolf"
			{...props}
		/>
	);
}

afterAll(() => {
	mock.restore();
});

describe("ConversationItemView", () => {
	it("formats feedback timeline items as review previews", async () => {
		const { resolveConversationItemTimelinePreview } = await modulePromise;

		const preview = resolveConversationItemTimelinePreview({
			item: {
				id: "msg-feedback",
				conversationId: "conv-feedback",
				organizationId: "org-1",
				visibility: "public",
				type: "message",
				text: "The drawer closes unexpectedly",
				parts: [
					{ type: "text", text: "The drawer closes unexpectedly" },
					{
						type: "feedback",
						feedbackId: "feedback-1",
						rating: 5,
						topic: "Bug",
						trigger: "dashboard_topbar",
						source: "widget",
					},
				],
				userId: null,
				visitorId: "visitor-1",
				aiAgentId: null,
				createdAt: "2026-03-11T03:00:00.000Z",
				deletedAt: null,
			},
			availableAIAgents: [],
			availableHumanAgents: [],
			visitor: null,
		});

		expect(preview).toBe("left a 5 star review");
	});

	it("renders an avatar trigger when a detail handler is provided", async () => {
		const html = await renderView({
			onAvatarClick: () => {},
		});

		expect(html).toContain('data-slot="conversation-item-avatar-trigger"');
		expect(html).toContain("Click to get more details");
		expect(html).toContain("cursor-pointer");
		expect(html).toContain("hover:scale-105");
	});

	it("renders a plain avatar when no detail handler is provided", async () => {
		const html = await renderView();

		expect(html).not.toContain('data-slot="conversation-item-avatar-trigger"');
		expect(html).toContain('data-slot="avatar"');
	});
});
