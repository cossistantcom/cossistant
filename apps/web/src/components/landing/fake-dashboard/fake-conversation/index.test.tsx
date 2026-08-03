import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMarcEscalatedConversation, marcVisitor } from "../data";
import { FakeConversation } from "./index";
import { FAKE_CONVERSATION_HUMAN_REPLY_TEXT } from "./use-fake-conversation";

// The fake conversation renders the real dashboard timeline, which reaches for
// tRPC, react-query and website context.
mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		conversation: {
			translateMessageGroup: {
				mutationOptions: () => ({}),
			},
		},
	}),
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutateAsync: async () => null,
	}),
}));

mock.module("@/contexts/website", () => ({
	useOptionalWebsite: () => null,
}));

mock.module("react-hotkeys-hook", () => ({
	useHotkeys: () => {},
}));

mock.module("motion/react", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	motion: {
		div: ({
			children,
			animate: _animate,
			exit: _exit,
			initial: _initial,
			layout: _layout,
			transition: _transition,
			...props
		}: React.HTMLAttributes<HTMLDivElement> &
			Record<string, unknown> & { children: React.ReactNode }) => (
			<div {...props}>{children}</div>
		),
		span: ({
			children,
			animate: _animate,
			exit: _exit,
			initial: _initial,
			layout: _layout,
			transition: _transition,
			...props
		}: React.HTMLAttributes<HTMLSpanElement> &
			Record<string, unknown> & { children: React.ReactNode }) => (
			<span {...props}>{children}</span>
		),
	},
	useReducedMotion: () => false,
}));

function createHumanReplyTimelineItem() {
	return {
		aiAgentId: null,
		conversationId: createMarcEscalatedConversation().id,
		createdAt: "2026-03-18T09:05:00.000Z",
		deletedAt: null,
		id: "01JGTIM22222222222222231",
		organizationId: "01JGORG11111111111111111",
		parts: [
			{ type: "text" as const, text: FAKE_CONVERSATION_HUMAN_REPLY_TEXT },
		],
		text: FAKE_CONVERSATION_HUMAN_REPLY_TEXT,
		type: "message" as const,
		userId: "01JGUSER1111111111111111",
		visitorId: null,
		visibility: "public" as const,
	};
}

describe("FakeConversation shell", () => {
	it("renders the shared composer escalation state while escalation is pending", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversation
					conversation={createMarcEscalatedConversation()}
					isEscalationPending={true}
					onJoinConversation={() => {}}
					timeline={[]}
					typingActors={[]}
					visitor={marcVisitor}
				/>
			</React.StrictMode>
		);

		expect(html).toContain("Human help requested by AI");
		expect(html).toContain("Join the conversation");
		expect(html).toContain('data-composer-frame="highlighted"');
		expect(html).toContain('data-composer-central-block="true"');
		expect(html).toContain('data-composer-bottom-block="true"');
		expect(html).not.toContain("Type your message...");
	});

	it("renders the live composer chrome once escalation is handled", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversation
					conversation={createMarcEscalatedConversation()}
					isEscalationPending={false}
					onComposerVisibilityChange={() => {}}
					onJoinConversation={() => {}}
					timeline={[]}
					typingActors={[]}
					visitor={marcVisitor}
				/>
			</React.StrictMode>
		);

		expect(html).toContain("Type your message...");
		expect(html).toContain('aria-label="Message visibility"');
		expect(html).toContain("Reply");
		expect(html).toContain("Private note");
		expect(html).toContain('data-composer-bottom-block="true"');
		expect(html).not.toContain("Join the conversation");
	});

	it("shows the shared fake textarea placeholder inside the resolved composer by default", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversation
					conversation={createMarcEscalatedConversation()}
					isEscalationPending={false}
					onComposerVisibilityChange={() => {}}
					onJoinConversation={() => {}}
					timeline={[]}
					typingActors={[]}
					visitor={marcVisitor}
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-composer-textarea-overlay="true"');
		expect(html).toContain('data-fake-textarea-display="true"');
		expect(html).toContain('data-fake-textarea-display-state="placeholder"');
		expect(html).toContain("Type your message...");
		expect(html).not.toContain('data-text-effect-caret="true"');
	});

	it("renders the scripted human reply as a textarea overlay before the timeline message commits", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversation
					composerValue={FAKE_CONVERSATION_HUMAN_REPLY_TEXT}
					conversation={createMarcEscalatedConversation()}
					isComposerTyping={true}
					isEscalationPending={false}
					onComposerVisibilityChange={() => {}}
					onJoinConversation={() => {}}
					timeline={[]}
					typingActors={[]}
					visitor={marcVisitor}
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-composer-textarea-overlay="true"');
		expect(html).toContain('data-fake-textarea-display="true"');
		expect(html).toContain('data-fake-textarea-display-state="typing"');
		expect(html).toContain('data-text-effect-caret="true"');
		expect(html).not.toContain('id="01JGTIM22222222222222231"');
	});

	it("restores the placeholder once the human reply is committed to the timeline", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversation
					conversation={createMarcEscalatedConversation()}
					isComposerTyping={false}
					isEscalationPending={false}
					onComposerVisibilityChange={() => {}}
					onJoinConversation={() => {}}
					timeline={[createHumanReplyTimelineItem()]}
					typingActors={[]}
					visitor={marcVisitor}
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-composer-textarea-overlay="true"');
		expect(html).toContain('data-fake-textarea-display-state="placeholder"');
		expect(html).toContain("Type your message...");
		expect(html).not.toContain('data-text-effect-caret="true"');
		expect(html).toContain(
			"I joined and deployed the allowlist patch to production."
		);
	});

	it("uses the private-note placeholder when the fake composer visibility is private", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversation
					composerVisibility="private"
					conversation={createMarcEscalatedConversation()}
					isEscalationPending={false}
					onComposerVisibilityChange={() => {}}
					onJoinConversation={() => {}}
					timeline={[]}
					typingActors={[]}
					visitor={marcVisitor}
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-composer-textarea-overlay="true"');
		expect(html).toContain('data-fake-textarea-display-state="placeholder"');
		expect(html).toContain("Write a private note...");
		expect(html).toContain("Private note");
	});

	it("can collapse the left sidebar shell while keeping the visitor sidebar visible", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversation
					conversation={createMarcEscalatedConversation()}
					isEscalationPending={false}
					leftSidebarOpen={false}
					onJoinConversation={() => {}}
					showLeftSidebar={true}
					showVisitorSidebar={true}
					timeline={[]}
					typingActors={[]}
					visitor={marcVisitor}
				/>
			</React.StrictMode>
		);

		expect(html).toContain("width:0");
		expect(html).toContain("sidebar-collapse");
		expect(html).toContain("Local time");
		expect(html).toContain("Country");
	});

	it("can hide the conversation header for minimal landing surfaces", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversation
					conversation={createMarcEscalatedConversation()}
					isEscalationPending={false}
					onJoinConversation={() => {}}
					showHeader={false}
					showLeftSidebar={false}
					showVisitorSidebar={false}
					timeline={[]}
					timelineClassName="pt-6"
					typingActors={[]}
					visitor={marcVisitor}
				/>
			</React.StrictMode>
		);

		expect(html).toContain("Type your message...");
		expect(html).toContain("pt-6");
		expect(html).not.toContain("sidebar-collapse");
		expect(html).not.toContain("Local time");
	});
});
