import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

type TypingState = {
	conversations: Record<string, Record<string, { actorType?: string | null }>>;
};

const openSupportOverlayCalls: string[] = [];
const supportNavigationNavigateCalls: unknown[] = [];
let isSupportOverlayOpen = false;
let unreadCount = 0;
let conversations: Array<{
	id: string;
	status: string;
	title?: string;
	visitorTitle?: string | null;
	lastTimelineItem?: {
		aiAgentId?: string | null;
		id?: string;
		text: string | null;
		parts: unknown[];
		userId?: string | null;
	};
	deletedAt?: string | null;
	resolvedAt?: string | null;
	resolvedByAiAgentId?: string | null;
	resolvedByUserId?: string | null;
}> = [];
let typingState: TypingState = {
	conversations: {},
};

const typingStore = {
	getState: () => typingState,
	subscribe: () => () => {},
};

let capturedSidebarItemOnClick: (() => void) | null = null;

mock.module("@cossistant/next/hooks", () => ({
	useConversations: () => ({
		conversations,
	}),
}));

mock.module("@cossistant/next/provider", () => ({
	useSupport: () => ({
		client: {
			typingStore,
		},
		unreadCount,
	}),
}));

mock.module("@cossistant/next/support", () => ({
	useSupportNavigation: () => ({
		navigate: (options: unknown) => {
			supportNavigationNavigateCalls.push(options);
		},
	}),
}));

mock.module("@/hooks/use-support-overlay-state", () => ({
	useSupportOverlayState: () => ({
		isOpen: isSupportOverlayOpen,
		openSupportOverlay: () => {
			openSupportOverlayCalls.push("open");
			return Promise.resolve(new URLSearchParams());
		},
	}),
}));

mock.module("@/components/ui/layout/sidebars/sidebar-item", () => ({
	SidebarItem: ({
		active,
		children,
		iconName,
		onClick,
		rightItem,
	}: {
		active?: boolean;
		children: React.ReactNode;
		iconName?: string;
		onClick?: () => void;
		rightItem?: React.ReactNode;
	}) => {
		capturedSidebarItemOnClick = onClick ?? null;

		return (
			<button
				data-active={String(Boolean(active))}
				data-icon-name={iconName ?? ""}
				type="button"
			>
				{children}
				{rightItem}
			</button>
		);
	},
}));

function resetState() {
	openSupportOverlayCalls.length = 0;
	supportNavigationNavigateCalls.length = 0;
	capturedSidebarItemOnClick = null;
	isSupportOverlayOpen = false;
	unreadCount = 0;
	conversations = [];
	typingState = {
		conversations: {},
	};
}

async function renderSidebarSupportItem() {
	const { SidebarSupportItem } = await import(
		`./sidebar-support-item?${Math.random()}`
	);
	return renderToStaticMarkup(<SidebarSupportItem />);
}

const installedGlobalKeys = [
	"window",
	"self",
	"document",
	"navigator",
	"Document",
	"DocumentFragment",
	"Element",
	"Event",
	"EventTarget",
	"FocusEvent",
	"HTMLElement",
	"MouseEvent",
	"Node",
	"SVGElement",
	"Text",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

async function renderSidebarSupportItemInDom() {
	const { Window } = await import("happy-dom");
	const windowInstance = new Window({
		url: "https://example.com",
	});

	setGlobalValue("window", windowInstance);
	setGlobalValue("self", windowInstance);
	setGlobalValue("document", windowInstance.document);
	setGlobalValue("navigator", windowInstance.navigator);
	setGlobalValue("Document", windowInstance.Document);
	setGlobalValue("DocumentFragment", windowInstance.DocumentFragment);
	setGlobalValue("Element", windowInstance.Element);
	setGlobalValue("Event", windowInstance.Event);
	setGlobalValue("EventTarget", windowInstance.EventTarget);
	setGlobalValue("FocusEvent", windowInstance.FocusEvent);
	setGlobalValue("HTMLElement", windowInstance.HTMLElement);
	setGlobalValue("MouseEvent", windowInstance.MouseEvent);
	setGlobalValue("Node", windowInstance.Node);
	setGlobalValue("SVGElement", windowInstance.SVGElement);
	setGlobalValue("Text", windowInstance.Text);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);

	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { SidebarSupportItem } = await import(
		`./sidebar-support-item?${Math.random()}`
	);
	const mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	const root = createRoot(mountNode) as RootHandle;

	await act(async () => {
		root.render(<SidebarSupportItem />);
	});

	return {
		mountNode,
		windowInstance,
		cleanup: async () => {
			await act(async () => {
				root.unmount();
			});
			mountNode.remove();

			for (const key of installedGlobalKeys) {
				Reflect.deleteProperty(globalThis, key);
			}
		},
	};
}

function countMatches(value: string, pattern: RegExp) {
	return value.match(pattern)?.length ?? 0;
}

describe("SidebarSupportItem", () => {
	it("opens the support overlay when selected", async () => {
		resetState();

		await renderSidebarSupportItem();
		capturedSidebarItemOnClick?.();

		expect(openSupportOverlayCalls).toEqual(["open"]);
		expect(supportNavigationNavigateCalls).toEqual([]);
	});

	it("renders a calm need help state without an icon when no conversation is open", async () => {
		resetState();

		const html = await renderSidebarSupportItem();

		expect(html).toContain("Need help?");
		expect(html).toContain('data-icon-name=""');
		expect(html).not.toContain("Support conversation");
	});

	it("renders a bordered rich state for an open support conversation", async () => {
		resetState();
		conversations = [
			{
				id: "conversation-1",
				status: "open",
				visitorTitle: "Billing question",
				lastTimelineItem: {
					text: "We are checking your invoice",
					parts: [],
				},
			},
		];

		const html = await renderSidebarSupportItem();

		expect(html).toContain("Conversation with support");
		expect(html).toContain("Open");
		expect(html).toContain("We are checking your invoice");
		expect(html).toContain('data-slot="support-conversation-label"');
		expect(html).toContain('data-slot="support-conversation-preview"');
		expect(html).toContain(
			'class="truncate font-medium text-primary text-sm" data-slot="support-conversation-label"'
		);
		expect(html).toContain(
			'class="flex min-w-0 items-center gap-1.5 text-primary/60 text-sm" data-slot="support-conversation-preview"'
		);
		expect(html).toContain("border");
		expect(html).not.toContain("Need help?");
		expect(html).not.toContain("Billing question");
		expect(html).not.toContain('data-slot="mock-avatar"');
		expect(countMatches(html, /We are checking your invoice/g)).toBe(1);
	});

	it("falls back to the need help state when conversations are not open", async () => {
		resetState();
		conversations = [
			{
				id: "conversation-1",
				status: "resolved",
				visitorTitle: "Resolved question",
				lastTimelineItem: {
					text: "This was handled already",
					parts: [],
				},
			},
			{
				id: "conversation-2",
				status: "spam",
				visitorTitle: "Spam question",
				lastTimelineItem: {
					text: "Ignore this one",
					parts: [],
				},
			},
		];

		const html = await renderSidebarSupportItem();

		expect(html).toContain("Need help?");
		expect(html).not.toContain("Conversation with support");
		expect(html).not.toContain("This was handled already");
		expect(html).not.toContain("Ignore this one");
	});

	it("falls back to need help when an open conversation has resolved or archived markers", async () => {
		resetState();
		conversations = [
			{
				id: "conversation-resolved-at",
				status: "open",
				resolvedAt: "2026-05-13T10:00:00.000Z",
				lastTimelineItem: {
					text: "Resolved by timestamp",
					parts: [],
				},
			},
			{
				id: "conversation-resolved-by-user",
				status: "open",
				resolvedByUserId: "user-1",
				lastTimelineItem: {
					text: "Resolved by user marker",
					parts: [],
				},
			},
			{
				id: "conversation-archived",
				status: "open",
				deletedAt: "2026-05-13T11:00:00.000Z",
				lastTimelineItem: {
					text: "Archived by timestamp",
					parts: [],
				},
			},
		];

		const html = await renderSidebarSupportItem();

		expect(html).toContain("Need help?");
		expect(html).not.toContain("Conversation with support");
		expect(html).not.toContain("Resolved by timestamp");
		expect(html).not.toContain("Resolved by user marker");
		expect(html).not.toContain("Archived by timestamp");
	});

	it("opens the support overlay from the rich support conversation", async () => {
		resetState();
		conversations = [
			{
				id: "conversation-1",
				status: "open",
				lastTimelineItem: {
					text: "We are checking your invoice",
					parts: [],
				},
			},
		];
		const rendered = await renderSidebarSupportItemInDom();

		try {
			const button = rendered.mountNode.getElementsByTagName("button")[0];
			button?.dispatchEvent(
				new rendered.windowInstance.MouseEvent("click", {
					bubbles: true,
				}) as unknown as Event
			);

			expect(openSupportOverlayCalls).toEqual(["open"]);
			expect(supportNavigationNavigateCalls).toEqual([
				{
					page: "CONVERSATION",
					params: {
						conversationId: "conversation-1",
					},
				},
			]);
		} finally {
			await rendered.cleanup();
		}
	});

	it("shows unread copy with a red dot on the rich support conversation", async () => {
		resetState();
		unreadCount = 2;
		conversations = [
			{
				id: "conversation-1",
				status: "open",
				visitorTitle: "Billing question",
				lastTimelineItem: {
					text: "We are checking your invoice",
					parts: [],
				},
			},
		];

		const html = await renderSidebarSupportItem();

		expect(html).toContain("2 unread messages");
		expect(html).toContain('data-slot="support-unread-dot"');
		expect(html).not.toContain("We are checking your invoice");
	});

	it("pluralizes a single unread message", async () => {
		resetState();
		unreadCount = 1;
		conversations = [
			{
				id: "conversation-1",
				status: "open",
				lastTimelineItem: {
					text: "We are checking your invoice",
					parts: [],
				},
			},
		];

		const html = await renderSidebarSupportItem();

		expect(html).toContain("1 unread message");
		expect(html).not.toContain("1 unread messages");
	});

	it("shows typing instead of unread count when a team member types in an open conversation", async () => {
		resetState();
		unreadCount = 4;
		conversations = [
			{
				id: "conversation-1",
				status: "open",
				visitorTitle: "Older question",
				lastTimelineItem: {
					text: "Older message",
					parts: [],
				},
			},
			{
				id: "conversation-2",
				status: "open",
				visitorTitle: "Priority support",
				lastTimelineItem: {
					text: "Unread message",
					parts: [],
				},
			},
		];
		typingState = {
			conversations: {
				"conversation-2": {
					"user-1": {
						actorType: "user",
					},
				},
			},
		};

		const html = await renderSidebarSupportItem();

		expect(html).toContain("Conversation with support");
		expect(html).toContain("Support is typing...");
		expect(html).toContain('aria-hidden="true"');
		expect(html).not.toContain("4 unread messages");
		expect(html).not.toContain("Unread message");
		expect(html).not.toContain('data-slot="support-unread-dot"');
	});

	it("marks the item active when the support overlay is open", async () => {
		resetState();
		isSupportOverlayOpen = true;

		const html = await renderSidebarSupportItem();

		expect(html).toContain('data-active="true"');
	});
});
