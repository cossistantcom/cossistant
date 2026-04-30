import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SubmitFeedbackResponse } from "@cossistant/types/api/feedback";
import type * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { SupportControllerContext } from "../controller-context";
import { type CossistantContextValue, SupportContext } from "../provider";
import { createMockSupportController } from "../test-utils/create-mock-support-controller";
import {
	type SubmitFeedbackVariables,
	useSubmitFeedback,
} from "./use-submit-feedback";

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
			createdAt: "2026-04-29T12:00:00.000Z",
			updatedAt: "2026-04-29T12:00:00.000Z",
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

function SubmitFeedbackProbe({
	onError,
	onSuccess,
	payload,
}: {
	onError?: (error: Error) => void;
	onSuccess?: (data: SubmitFeedbackResponse) => void;
	payload: SubmitFeedbackVariables;
}) {
	const submitFeedback = useSubmitFeedback({ onError, onSuccess });

	return (
		<div>
			<button
				data-slot="submit"
				onClick={() => {
					void submitFeedback.mutateAsync(payload).catch(() => {});
				}}
				type="button"
			>
				Submit
			</button>
			<button
				data-slot="mutate"
				onClick={() => {
					submitFeedback.mutate(payload);
				}}
				type="button"
			>
				Mutate
			</button>
			<button data-slot="reset" onClick={submitFeedback.reset} type="button">
				Reset
			</button>
			<div data-error={submitFeedback.error?.message ?? ""} />
			<div data-pending={String(submitFeedback.isPending)} />
		</div>
	);
}

function getBySlot(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);

	if (!element) {
		throw new Error(`Could not find [data-slot="${slot}"]`);
	}

	return element;
}

function getErrorText(): string {
	return (
		document.querySelector<HTMLElement>("[data-error]")?.dataset.error ?? ""
	);
}

describe("useSubmitFeedback", () => {
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

	it("submits normalized feedback with visitor and contact context", async () => {
		let submittedPayload: SubmitFeedbackVariables | null = null;
		const submitFeedback = mock(async (payload: SubmitFeedbackVariables) => {
			submittedPayload = payload;
			return createFeedbackResponse();
		});
		const onSuccess = mock(() => {});
		const context = createSupportContextValue({
			client: {
				submitFeedback,
			} as CossistantContextValue["client"],
		});

		await renderWithSupportContext(
			<SubmitFeedbackProbe
				onSuccess={onSuccess}
				payload={{
					rating: 5,
					topic: " Bug ",
					comment: " It broke ",
					trigger: " dashboard_topbar ",
					conversationId: " ",
				}}
			/>,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("submit").click();
		});

		expect(submitFeedback).toHaveBeenCalledTimes(1);
		expect(submittedPayload).toEqual({
			rating: 5,
			source: "widget",
			visitorId: "visitor_123",
			contactId: "contact_123",
			topic: "Bug",
			comment: "It broke",
			trigger: "dashboard_topbar",
		});
		expect(onSuccess).toHaveBeenCalledTimes(1);
		expect(onSuccess).toHaveBeenCalledWith(createFeedbackResponse());
	});

	it("keeps explicit visitor and contact IDs over context defaults and trims source", async () => {
		let submittedPayload: SubmitFeedbackVariables | null = null;
		const submitFeedback = mock(async (payload: SubmitFeedbackVariables) => {
			submittedPayload = payload;
			return createFeedbackResponse();
		});
		const context = createSupportContextValue({
			client: {
				submitFeedback,
			} as CossistantContextValue["client"],
		});

		await renderWithSupportContext(
			<SubmitFeedbackProbe
				payload={{
					rating: 4,
					visitorId: "visitor_explicit",
					contactId: "contact_explicit",
					source: " email ",
				}}
			/>,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("submit").click();
		});

		expect(submittedPayload).toEqual({
			rating: 4,
			source: "email",
			visitorId: "visitor_explicit",
			contactId: "contact_explicit",
		});
	});

	it("surfaces missing client errors and clears them on reset", async () => {
		let receivedError: Error | null = null;
		const onError = mock((error: Error) => {
			receivedError = error;
		});
		const context = createSupportContextValue({
			client: null,
		});

		await renderWithSupportContext(
			<SubmitFeedbackProbe
				onError={onError}
				payload={{
					rating: 3,
				}}
			/>,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("submit").click();
		});

		expect(getErrorText()).toContain("Cossistant client is not available");
		expect(onError).toHaveBeenCalledTimes(1);
		expect(receivedError?.message).toContain(
			"Cossistant client is not available"
		);

		await act(async () => {
			getBySlot("reset").click();
		});

		expect(getErrorText()).toBe("");
	});

	it("swallows mutate errors while still exposing error state", async () => {
		const onError = mock(() => {});
		const context = createSupportContextValue({
			client: null,
		});

		await renderWithSupportContext(
			<SubmitFeedbackProbe
				onError={onError}
				payload={{
					rating: 3,
				}}
			/>,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("mutate").click();
			await Promise.resolve();
		});

		expect(getErrorText()).toContain("Cossistant client is not available");
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("surfaces missing visitor context errors", async () => {
		const onError = mock(() => {});
		const context = createSupportContextValue({
			website: {
				id: "site_123",
				name: "Acme",
				availableAIAgents: [],
				availableHumanAgents: [],
				visitor: null,
			} as CossistantContextValue["website"],
		});

		await renderWithSupportContext(
			<SubmitFeedbackProbe
				onError={onError}
				payload={{
					rating: 2,
				}}
			/>,
			context
		);

		const { act } = await import("react");
		await act(async () => {
			getBySlot("submit").click();
		});

		expect(getErrorText()).toBe("Visitor context is unavailable.");
		expect(onError).toHaveBeenCalledTimes(1);
	});
});
