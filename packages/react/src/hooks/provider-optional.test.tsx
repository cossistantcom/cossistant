import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { CossistantClient } from "@cossistant/core";
import type { CreateConversationResponseBody } from "@cossistant/types/api/conversation";
import type {
	SubmitFeedbackRequest,
	SubmitFeedbackResponse,
} from "@cossistant/types/api/feedback";
import type {
	SendTimelineItemRequest,
	SendTimelineItemResponse,
} from "@cossistant/types/api/timeline-item";
import type { Conversation } from "@cossistant/types/schemas";
import * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { type CossistantContextValue, SupportContext } from "../provider";
import { useCreateConversation } from "./use-create-conversation";
import { useFeedbackForm } from "./use-feedback-form";
import { useFileUpload } from "./use-file-upload";
import { useSendMessage } from "./use-send-message";
import { useSubmitFeedback } from "./use-submit-feedback";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

const installedGlobalKeys = [
	"window",
	"self",
	"document",
	"navigator",
	"Blob",
	"Document",
	"DocumentFragment",
	"Element",
	"Event",
	"EventTarget",
	"File",
	"HTMLElement",
	"MouseEvent",
	"Node",
	"SyntaxError",
	"Text",
	"getComputedStyle",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;
let pendingAction: Promise<unknown> | null = null;

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(window: Window) {
	(window as Window & { SyntaxError?: typeof Error }).SyntaxError = Error;
	setGlobalValue("window", window);
	setGlobalValue("self", window);
	setGlobalValue("document", window.document);
	setGlobalValue("navigator", window.navigator);
	setGlobalValue("Blob", window.Blob);
	setGlobalValue("Document", window.Document);
	setGlobalValue("DocumentFragment", window.DocumentFragment);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("File", window.File);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

function createFeedbackResponse(
	request: SubmitFeedbackRequest
): SubmitFeedbackResponse {
	return {
		feedback: {
			id: "feedback_123",
			organizationId: "org_123",
			websiteId: "site_123",
			conversationId: request.conversationId ?? null,
			visitorId: request.visitorId,
			contactId: request.contactId ?? null,
			rating: request.rating,
			topic: request.topic ?? null,
			comment: request.comment ?? null,
			trigger: request.trigger ?? null,
			source: request.source,
			createdAt: "2026-06-19T12:00:00.000Z",
			updatedAt: "2026-06-19T12:00:00.000Z",
		},
	};
}

function createConversationFixture(
	overrides: Partial<Conversation> = {}
): Conversation {
	return {
		id: "conversation_123",
		organizationId: "org_123",
		websiteId: "site_123",
		visitorId: "visitor_123",
		contactId: null,
		assignedUserId: null,
		assignedAIAgentId: null,
		status: "open",
		channel: "widget",
		priority: "normal",
		title: null,
		lastMessageAt: null,
		lastTimelineItem: null,
		visitorLastSeenAt: null,
		createdAt: "2026-06-19T12:00:00.000Z",
		updatedAt: "2026-06-19T12:00:00.000Z",
		deletedAt: null,
		...overrides,
	} as Conversation;
}

function createClient() {
	const submitFeedback = mock(async (request: SubmitFeedbackRequest) =>
		createFeedbackResponse(request)
	);
	const sendMessage = mock(
		async (
			request: SendTimelineItemRequest
		): Promise<SendTimelineItemResponse> =>
			({
				item: {
					...request.item,
					id: request.item.id,
					conversationId: request.conversationId,
					organizationId: "org_123",
					deletedAt: null,
				},
			}) as SendTimelineItemResponse
	);
	const initiateConversation = mock(
		(): CreateConversationResponseBody & {
			conversationId: string;
			defaultTimelineItems: [];
		} => ({
			conversationId: "conversation_123",
			conversation: createConversationFixture(),
			defaultTimelineItems: [],
			initialTimelineItems: [],
		})
	);
	const generateUploadUrl = mock(async () => ({
		uploadUrl: "https://uploads.example.com/note.txt",
		publicUrl: "https://cdn.example.com/note.txt",
	}));
	const uploadFile = mock(async () => {});

	const client = {
		generateUploadUrl,
		initiateConversation,
		sendMessage,
		submitFeedback,
		uploadFile,
	} as unknown as CossistantClient;

	return {
		client,
		generateUploadUrl,
		initiateConversation,
		sendMessage,
		submitFeedback,
		uploadFile,
	};
}

function createSupportContextValue(
	client: CossistantClient | null
): CossistantContextValue {
	return {
		website: {
			id: "site_123",
			name: "Acme",
			availableAIAgents: [],
			availableHumanAgents: [],
			visitor: {
				id: "visitor_context",
				language: "en",
				contact: {
					id: "contact_context",
				},
				isBlocked: false,
			},
		} as CossistantContextValue["website"],
		defaultMessages: [],
		quickOptions: [],
		setDefaultMessages: () => {},
		setQuickOptions: () => {},
		unreadCount: 0,
		setUnreadCount: () => {},
		isLoading: false,
		error: null,
		configurationError: null,
		client,
		isOpen: false,
		open: () => {},
		close: () => {},
		toggle: () => {},
	};
}

async function render(node: React.ReactNode) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(node);
	});
}

function getBySlot(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);

	if (!element) {
		throw new Error(`Could not find [data-slot="${slot}"]`);
	}

	return element;
}

function createTextFile(): File {
	return new File(["hello"], "note.txt", { type: "text/plain" });
}

function MutationSuiteProbe({
	client,
	useExplicitClient,
}: {
	client?: CossistantClient | null;
	useExplicitClient: boolean;
}) {
	const submitFeedback = useSubmitFeedback(
		useExplicitClient ? { client } : undefined
	);
	const sendMessage = useSendMessage(
		useExplicitClient ? { client } : undefined
	);
	const createConversation = useCreateConversation(
		useExplicitClient ? { client } : undefined
	);
	const fileUpload = useFileUpload(useExplicitClient ? { client } : undefined);

	return (
		<div>
			<button
				data-slot="run"
				onClick={() => {
					pendingAction = Promise.all([
						submitFeedback.mutateAsync({
							rating: 4,
							source: "headless",
							visitorId: "visitor_explicit",
							contactId: "contact_explicit",
						}),
						sendMessage.mutateAsync({
							conversationId: "conversation_existing",
							message: "Hello",
							visitorId: "visitor_explicit",
						}),
						createConversation.mutateAsync({
							visitorId: "visitor_explicit",
						}),
						fileUpload.uploadFiles([createTextFile()], "conversation_existing"),
					]);
				}}
				type="button"
			>
				Run
			</button>
		</div>
	);
}

function FeedbackFormProbe({
	client,
	useExplicitClient,
}: {
	client?: CossistantClient | null;
	useExplicitClient: boolean;
}) {
	const feedbackForm = useFeedbackForm(
		useExplicitClient
			? {
					client,
					visitorId: "visitor_explicit",
					contactId: "contact_explicit",
					source: "headless-form",
				}
			: {
					source: "headless-form",
				}
	);

	return (
		<div>
			<button
				data-slot="form-rate"
				onClick={() => feedbackForm.handleRatingSelect(5)}
				type="button"
			>
				Rate
			</button>
			<button
				data-slot="form-comment"
				onClick={() => feedbackForm.handleCommentChange(" Useful ")}
				type="button"
			>
				Comment
			</button>
			<button
				data-slot="form-submit"
				onClick={() => {
					pendingAction = feedbackForm.handleSubmit();
				}}
				type="button"
			>
				Submit form
			</button>
		</div>
	);
}

function MissingClientProbe({
	client,
	useExplicitClient = false,
}: {
	client?: CossistantClient | null;
	useExplicitClient?: boolean;
}) {
	const options = useExplicitClient ? { client } : undefined;
	const submitFeedback = useSubmitFeedback(options);
	const sendMessage = useSendMessage(options);
	const createConversation = useCreateConversation(options);
	const fileUpload = useFileUpload(options);
	const [errors, setErrors] = React.useState<string[]>([]);

	return (
		<div>
			<button
				data-slot="run-missing"
				onClick={() => {
					pendingAction = Promise.allSettled([
						submitFeedback.mutateAsync({
							rating: 4,
							visitorId: "visitor_explicit",
						}),
						sendMessage.mutateAsync({
							conversationId: "conversation_existing",
							message: "Hello",
						}),
						createConversation.mutateAsync(),
						fileUpload.uploadFiles([createTextFile()], "conversation_existing"),
					]).then((results) => {
						setErrors(
							results.map((result) =>
								result.status === "rejected"
									? result.reason instanceof Error
										? result.reason.message
										: String(result.reason)
									: "resolved"
							)
						);
					});
				}}
				type="button"
			>
				Run missing
			</button>
			<div data-errors={errors.join("|")} data-slot="errors" />
		</div>
	);
}

describe("provider-optional mutation hooks", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		pendingAction = null;
		windowInstance = new Window({
			url: "https://example.com",
		});
		installDomGlobals(windowInstance);
	});

	afterEach(async () => {
		const { act } = await import("react");

		if (activeRoot) {
			await act(async () => {
				activeRoot?.unmount();
			});
		}

		mountNode?.remove();
		activeRoot = null;
		mountNode = null;
		pendingAction = null;
		windowInstance = null;

		for (const key of installedGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
		}
	});

	it("uses explicit clients outside SupportProvider", async () => {
		const mockClient = createClient();

		await render(
			<MutationSuiteProbe client={mockClient.client} useExplicitClient={true} />
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("run").click();
			await pendingAction;
		});

		expect(mockClient.submitFeedback).toHaveBeenCalledTimes(1);
		expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);
		expect(mockClient.initiateConversation).toHaveBeenCalledTimes(1);
		expect(mockClient.generateUploadUrl).toHaveBeenCalledTimes(1);
		expect(mockClient.uploadFile).toHaveBeenCalledTimes(1);
	});

	it("uses provider context clients when explicit clients are omitted", async () => {
		const mockClient = createClient();

		await render(
			<SupportContext.Provider
				value={createSupportContextValue(mockClient.client)}
			>
				<MutationSuiteProbe useExplicitClient={false} />
			</SupportContext.Provider>
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("run").click();
			await pendingAction;
		});

		expect(mockClient.submitFeedback).toHaveBeenCalledTimes(1);
		expect(mockClient.submitFeedback.mock.calls[0]?.[0]).toMatchObject({
			visitorId: "visitor_explicit",
			contactId: "contact_explicit",
		});
		expect(mockClient.sendMessage).toHaveBeenCalledTimes(1);
		expect(mockClient.initiateConversation).toHaveBeenCalledTimes(1);
		expect(mockClient.generateUploadUrl).toHaveBeenCalledTimes(1);
	});

	it("prefers explicit clients over provider context clients", async () => {
		const explicitClient = createClient();
		const providerClient = createClient();

		await render(
			<SupportContext.Provider
				value={createSupportContextValue(providerClient.client)}
			>
				<MutationSuiteProbe
					client={explicitClient.client}
					useExplicitClient={true}
				/>
			</SupportContext.Provider>
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("run").click();
			await pendingAction;
		});

		expect(explicitClient.submitFeedback).toHaveBeenCalledTimes(1);
		expect(explicitClient.sendMessage).toHaveBeenCalledTimes(1);
		expect(explicitClient.initiateConversation).toHaveBeenCalledTimes(1);
		expect(explicitClient.generateUploadUrl).toHaveBeenCalledTimes(1);
		expect(providerClient.submitFeedback).not.toHaveBeenCalled();
		expect(providerClient.sendMessage).not.toHaveBeenCalled();
		expect(providerClient.initiateConversation).not.toHaveBeenCalled();
		expect(providerClient.generateUploadUrl).not.toHaveBeenCalled();
	});

	it("lets useFeedbackForm submit with an explicit client outside SupportProvider", async () => {
		const mockClient = createClient();

		await render(
			<FeedbackFormProbe client={mockClient.client} useExplicitClient={true} />
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("form-rate").click();
		});
		await act(async () => {
			getBySlot("form-comment").click();
		});
		await act(async () => {
			getBySlot("form-submit").click();
			await pendingAction;
		});

		expect(mockClient.submitFeedback).toHaveBeenCalledTimes(1);
		expect(mockClient.submitFeedback.mock.calls[0]?.[0]).toMatchObject({
			rating: 5,
			comment: "Useful",
			visitorId: "visitor_explicit",
			contactId: "contact_explicit",
			source: "headless-form",
		});
	});

	it("lets useFeedbackForm submit with provider context fallback", async () => {
		const mockClient = createClient();

		await render(
			<SupportContext.Provider
				value={createSupportContextValue(mockClient.client)}
			>
				<FeedbackFormProbe useExplicitClient={false} />
			</SupportContext.Provider>
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("form-rate").click();
		});
		await act(async () => {
			getBySlot("form-submit").click();
			await pendingAction;
		});

		expect(mockClient.submitFeedback).toHaveBeenCalledTimes(1);
		expect(mockClient.submitFeedback.mock.calls[0]?.[0]).toMatchObject({
			rating: 5,
			visitorId: "visitor_context",
			contactId: "contact_context",
			source: "headless-form",
		});
	});

	it("surfaces missing-client errors without requiring SupportProvider", async () => {
		await render(<MissingClientProbe />);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("run-missing").click();
			await pendingAction;
		});

		const errors = getBySlot("errors").dataset.errors ?? "";
		expect(errors.split("|")).toEqual([
			expect.stringContaining("Cossistant client is not available"),
			expect.stringContaining("Cossistant client is not available"),
			expect.stringContaining("Cossistant client is not available"),
			expect.stringContaining("Cossistant client is not available"),
		]);
	});

	it("treats null client as an explicit override instead of provider fallback", async () => {
		const providerClient = createClient();

		await render(
			<SupportContext.Provider
				value={createSupportContextValue(providerClient.client)}
			>
				<MissingClientProbe client={null} useExplicitClient={true} />
			</SupportContext.Provider>
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("run-missing").click();
			await pendingAction;
		});

		const errors = getBySlot("errors").dataset.errors ?? "";
		expect(errors.split("|")).toEqual([
			expect.stringContaining("Cossistant client is not available"),
			expect.stringContaining("Cossistant client is not available"),
			expect.stringContaining("Cossistant client is not available"),
			expect.stringContaining("Cossistant client is not available"),
		]);
		expect(providerClient.submitFeedback).not.toHaveBeenCalled();
		expect(providerClient.sendMessage).not.toHaveBeenCalled();
		expect(providerClient.initiateConversation).not.toHaveBeenCalled();
		expect(providerClient.generateUploadUrl).not.toHaveBeenCalled();
	});
});
