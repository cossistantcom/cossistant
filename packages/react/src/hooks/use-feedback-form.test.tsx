import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SubmitFeedbackResponse } from "@cossistant/types/api/feedback";
import type * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { SupportControllerContext } from "../controller-context";
import { type CossistantContextValue, SupportContext } from "../provider";
import { createMockSupportController } from "../test-utils/create-mock-support-controller";
import {
	type UseFeedbackFormOptions,
	useFeedbackForm,
} from "./use-feedback-form";
import type { SubmitFeedbackVariables } from "./use-submit-feedback";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

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
	setGlobalValue("Document", window.Document);
	setGlobalValue("DocumentFragment", window.DocumentFragment);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

function createFeedbackResponse(): SubmitFeedbackResponse {
	return {
		feedback: {
			id: "feedback_123",
			organizationId: "org_123",
			websiteId: "site_123",
			conversationId: null,
			visitorId: "visitor_123",
			contactId: "contact_123",
			rating: 5,
			topic: "Bug",
			comment: "It broke",
			trigger: "dashboard_topbar",
			source: "widget",
			createdAt: "2026-04-30T12:00:00.000Z",
			updatedAt: "2026-04-30T12:00:00.000Z",
		},
	};
}

function createSupportContextValue(
	overrides: Partial<CossistantContextValue> = {}
): CossistantContextValue {
	return {
		website: {
			id: "site_123",
			name: "Acme",
			availableAIAgents: [],
			availableHumanAgents: [],
			visitor: {
				id: "visitor_123",
				language: "en",
				contact: {
					id: "contact_123",
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
		client: {
			submitFeedback: async () => createFeedbackResponse(),
		} as CossistantContextValue["client"],
		isOpen: false,
		open: () => {},
		close: () => {},
		toggle: () => {},
		...overrides,
	};
}

async function renderWithSupportContext(
	node: React.ReactNode,
	context: CossistantContextValue
) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(
			<SupportControllerContext.Provider value={createMockSupportController()}>
				<SupportContext.Provider value={context}>
					{node}
				</SupportContext.Provider>
			</SupportControllerContext.Provider>
		);
	});
}

function FeedbackFormProbe({ options }: { options?: UseFeedbackFormOptions }) {
	const feedback = useFeedbackForm(options);

	return (
		<form data-slot="form" onSubmit={feedback.handleSubmit}>
			<button
				data-slot="topic-bug"
				onClick={() => feedback.handleTopicChange(" Bug ")}
				type="button"
			>
				Bug
			</button>
			<button
				data-slot="topic-empty"
				onClick={() => feedback.handleTopicChange(" ")}
				type="button"
			>
				Empty topic
			</button>
			<button
				data-slot="topic-blur"
				onClick={feedback.fields.topic.handleBlur}
				type="button"
			>
				Blur topic
			</button>
			<button
				data-slot="topic-other"
				onClick={() => feedback.handleTopicChange("Other")}
				type="button"
			>
				Other
			</button>
			<button
				data-slot="comment"
				onClick={() => feedback.handleCommentChange("  The nav jumps.  ")}
				type="button"
			>
				Comment
			</button>
			<button
				data-slot="comment-empty"
				onClick={() => feedback.handleCommentChange("   ")}
				type="button"
			>
				Empty comment
			</button>
			<button
				data-slot="comment-blur"
				onClick={feedback.fields.comment.handleBlur}
				type="button"
			>
				Blur comment
			</button>
			<button
				data-slot="rating"
				onClick={() => feedback.handleRatingSelect(5)}
				type="button"
			>
				Rating
			</button>
			<button
				data-slot="rating-blur"
				onClick={feedback.fields.rating.handleBlur}
				type="button"
			>
				Blur rating
			</button>
			<button
				data-slot="hover"
				onClick={() => feedback.handleRatingHoverChange(4)}
				type="button"
			>
				Hover
			</button>
			<button data-slot="submit" type="submit">
				Submit
			</button>
			<button
				data-slot="submit-direct"
				onClick={feedback.handleSubmit}
				type="button"
			>
				Submit direct
			</button>
			<button
				data-slot="open"
				onClick={() => feedback.handleOpenChange(true)}
				type="button"
			>
				Open
			</button>
			<button
				data-slot="close"
				onClick={() => feedback.handleOpenChange(false)}
				type="button"
			>
				Close
			</button>
			<button
				data-slot="send-another"
				onClick={feedback.sendAnother}
				type="button"
			>
				Send another
			</button>
			<button data-slot="done" onClick={feedback.done} type="button">
				Done
			</button>
			<div
				data-attempted={String(feedback.hasAttemptedSubmit)}
				data-can-submit={String(feedback.canSubmit)}
				data-comment={feedback.comment}
				data-comment-dirty={String(feedback.fields.comment.isDirty)}
				data-comment-error={feedback.fields.comment.error ?? ""}
				data-comment-touched={String(feedback.fields.comment.isTouched)}
				data-error={feedback.submitError ?? ""}
				data-hovered-rating={feedback.hoveredRating ?? ""}
				data-is-comment-missing={String(feedback.isCommentMissing)}
				data-is-rating-missing={String(feedback.isRatingMissing)}
				data-is-topic-missing={String(feedback.isTopicMissing)}
				data-open={String(feedback.open)}
				data-rating={feedback.rating ?? ""}
				data-rating-dirty={String(feedback.fields.rating.isDirty)}
				data-rating-display-value={feedback.fields.rating.displayValue ?? ""}
				data-rating-error={feedback.fields.rating.error ?? ""}
				data-rating-selected-value={feedback.fields.rating.selectedValue}
				data-rating-touched={String(feedback.fields.rating.isTouched)}
				data-slot="state"
				data-submit-can-attempt-submit={String(
					feedback.submit.canAttemptSubmit
				)}
				data-submit-can-submit={String(feedback.submit.canSubmit)}
				data-submit-disabled={String(feedback.submit.disabled)}
				data-submit-label={feedback.submit.label}
				data-submitted={String(feedback.hasSubmitted)}
				data-topic={feedback.topic}
				data-topic-dirty={String(feedback.fields.topic.isDirty)}
				data-topic-error={feedback.fields.topic.error ?? ""}
				data-topic-touched={String(feedback.fields.topic.isTouched)}
				data-topics={feedback.availableTopics.join("|")}
			/>
		</form>
	);
}

function getBySlot(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);

	if (!element) {
		throw new Error(`Could not find [data-slot="${slot}"]`);
	}

	return element;
}

function getState(): DOMStringMap {
	return getBySlot("state").dataset;
}

function click(slot: string) {
	getBySlot(slot).click();
}

describe("useFeedbackForm", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
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
		windowInstance = null;

		for (const key of installedGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
		}
	});

	it("exposes initial state, normalized topics, and default topic", async () => {
		await renderWithSupportContext(
			<FeedbackFormProbe
				options={{
					defaultOpen: true,
					defaultTopic: "Bug",
					topics: [" Bug ", "Bug", " Feature request ", ""],
				}}
			/>,
			createSupportContextValue()
		);

		expect(getState().open).toBe("true");
		expect(getState().topic).toBe("Bug");
		expect(getState().topics).toBe("Bug|Feature request");
		expect(getState().canSubmit).toBe("false");
		expect(getState().attempted).toBe("false");
		expect(getState().submitLabel).toBe("Rating needed");
		expect(getState().submitDisabled).toBe("true");
		expect(getState().submitCanAttemptSubmit).toBe("false");
		expect(getState().topicError).toBe("");
		expect(getState().commentError).toBe("");
		expect(getState().ratingError).toBe("");
	});

	it("exposes structured rating display and submit state", async () => {
		await renderWithSupportContext(
			<FeedbackFormProbe />,
			createSupportContextValue()
		);

		expect(getState().ratingDisplayValue).toBe("");
		expect(getState().ratingSelectedValue).toBe("");
		expect(getState().submitLabel).toBe("Rating needed");
		expect(getState().submitDisabled).toBe("true");
		expect(getState().ratingError).toBe("");

		const { act } = await import("react");
		await act(async () => {
			click("rating-blur");
		});

		expect(getState().ratingTouched).toBe("true");
		expect(getState().ratingError).toBe(
			"Choose a rating before sending feedback."
		);

		await act(async () => {
			click("rating");
		});

		expect(getState().ratingDirty).toBe("true");
		expect(getState().rating).toBe("5");
		expect(getState().ratingDisplayValue).toBe("5");
		expect(getState().ratingSelectedValue).toBe("5");
		expect(getState().submitLabel).toBe("Send");
		expect(getState().submitCanSubmit).toBe("true");
		expect(getState().submitDisabled).toBe("false");
		expect(getState().ratingError).toBe("");

		await act(async () => {
			click("hover");
		});

		expect(getState().ratingDisplayValue).toBe("4");
		expect(getState().ratingSelectedValue).toBe("5");
	});

	it("validates missing rating and topic before submitting", async () => {
		let submittedPayload: SubmitFeedbackVariables | null = null;
		const context = createSupportContextValue({
			client: {
				submitFeedback: async (payload: SubmitFeedbackVariables) => {
					submittedPayload = payload;
					return createFeedbackResponse();
				},
			} as CossistantContextValue["client"],
		});

		await renderWithSupportContext(
			<FeedbackFormProbe options={{ topics: ["Bug"] }} />,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("form").dispatchEvent(
				new window.Event("submit", { bubbles: true, cancelable: true })
			);
		});

		expect(getState().attempted).toBe("true");
		expect(getState().isRatingMissing).toBe("true");
		expect(getState().isTopicMissing).toBe("true");
		expect(getState().ratingError).toBe("");
		expect(getState().topicError).toBe("");
		expect(getState().submitDisabled).toBe("true");
		expect(getState().submitted).toBe("false");
		expect(submittedPayload).toBeNull();

		await act(async () => {
			click("rating-blur");
			click("topic-blur");
		});

		expect(getState().ratingError).toBe(
			"Choose a rating before sending feedback."
		);
		expect(getState().topicError).toBe(
			"Select a topic before sending feedback."
		);
	});

	it("validates required comments before submitting", async () => {
		let submittedPayload: SubmitFeedbackVariables | null = null;
		const context = createSupportContextValue({
			client: {
				submitFeedback: async (payload: SubmitFeedbackVariables) => {
					submittedPayload = payload;
					return createFeedbackResponse();
				},
			} as CossistantContextValue["client"],
		});

		await renderWithSupportContext(
			<FeedbackFormProbe
				options={{
					commentRequired: true,
					topics: ["Bug"],
				}}
			/>,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			click("topic-bug");
			click("rating");
		});
		await act(async () => {
			click("submit-direct");
		});

		expect(getState().attempted).toBe("true");
		expect(getState().isCommentMissing).toBe("true");
		expect(getState().commentError).toBe("");
		expect(getState().submitDisabled).toBe("true");
		expect(submittedPayload).toBeNull();

		await act(async () => {
			click("comment-empty");
		});

		expect(getState().commentDirty).toBe("true");
		expect(getState().commentError).toBe(
			"Add a message before sending feedback."
		);

		await act(async () => {
			click("comment");
		});

		expect(getState().commentDirty).toBe("true");
		expect(getState().isCommentMissing).toBe("false");
		expect(getState().commentError).toBe("");
		expect(getState().submitDisabled).toBe("false");

		await act(async () => {
			click("submit-direct");
		});

		expect(submittedPayload).toMatchObject({
			rating: 5,
			topic: "Bug",
			comment: "The nav jumps.",
		});
	});

	it("submits a normalized payload and marks the form as submitted", async () => {
		let submittedPayload: SubmitFeedbackVariables | null = null;
		const context = createSupportContextValue({
			client: {
				submitFeedback: async (payload: SubmitFeedbackVariables) => {
					submittedPayload = payload;
					return createFeedbackResponse();
				},
			} as CossistantContextValue["client"],
		});

		await renderWithSupportContext(
			<FeedbackFormProbe
				options={{
					conversationId: "conversation_123",
					trigger: " dashboard_topbar ",
					topics: ["Bug"],
				}}
			/>,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			click("topic-bug");
			click("comment");
			click("rating");
		});
		await act(async () => {
			click("submit-direct");
		});

		expect(submittedPayload).toEqual({
			rating: 5,
			source: "widget",
			visitorId: "visitor_123",
			contactId: "contact_123",
			topic: "Bug",
			comment: "The nav jumps.",
			trigger: "dashboard_topbar",
			conversationId: "conversation_123",
		});
		expect(getState().submitted).toBe("true");
	});

	it("clears stale submit errors when the form changes", async () => {
		const context = createSupportContextValue({
			client: {
				submitFeedback: async () => {
					throw new Error("Feedback service is unavailable.");
				},
			} as CossistantContextValue["client"],
		});

		await renderWithSupportContext(
			<FeedbackFormProbe options={{ topics: ["Bug", "Other"] }} />,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			click("topic-bug");
			click("rating");
		});
		await act(async () => {
			click("submit-direct");
		});

		expect(getState().error).toBe("Feedback service is unavailable.");

		await act(async () => {
			click("topic-other");
		});

		expect(getState().error).toBe("");
	});

	it("exposes pending submit label and disabled state", async () => {
		let resolveSubmit: (response: SubmitFeedbackResponse) => void = () => {};
		const context = createSupportContextValue({
			client: {
				submitFeedback: async () =>
					new Promise<SubmitFeedbackResponse>((resolve) => {
						resolveSubmit = resolve;
					}),
			} as CossistantContextValue["client"],
		});

		await renderWithSupportContext(
			<FeedbackFormProbe options={{ topics: ["Bug"] }} />,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			click("topic-bug");
			click("comment");
			click("rating");
		});
		await act(async () => {
			click("submit-direct");
		});

		expect(getState().submitLabel).toBe("Sending...");
		expect(getState().submitDisabled).toBe("true");
		expect(getState().submitCanAttemptSubmit).toBe("false");

		await act(async () => {
			resolveSubmit(createFeedbackResponse());
			await Promise.resolve();
		});

		expect(getState().submitted).toBe("true");
	});

	it("resets, sends another, closes, and reports open changes", async () => {
		const onOpenChange = mock(() => {});
		const context = createSupportContextValue();

		await renderWithSupportContext(
			<FeedbackFormProbe
				options={{
					defaultOpen: true,
					defaultTopic: "Bug",
					onOpenChange,
					topics: ["Bug"],
				}}
			/>,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			click("comment");
			click("rating");
			click("hover");
		});
		await act(async () => {
			click("submit-direct");
		});

		expect(getState().submitted).toBe("true");
		expect(getState().rating).toBe("5");
		expect(getState().hoveredRating).toBe("4");

		await act(async () => {
			click("send-another");
		});

		expect(getState().submitted).toBe("false");
		expect(getState().topic).toBe("Bug");
		expect(getState().rating).toBe("");
		expect(getState().hoveredRating).toBe("");

		await act(async () => {
			click("done");
		});

		expect(getState().open).toBe("false");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
