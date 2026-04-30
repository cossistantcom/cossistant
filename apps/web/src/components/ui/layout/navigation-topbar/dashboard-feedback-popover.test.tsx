import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SubmitFeedbackResponse } from "@cossistant/types/api/feedback";
import { Window } from "happy-dom";
import React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

type SubmitFeedbackVariables = {
	rating: number;
	topic?: string;
	comment?: string;
	trigger?: string;
};

const submittedFeedback: SubmitFeedbackVariables[] = [];
let shouldReject = false;

const PopoverContext = React.createContext<{
	onOpenChange?: (open: boolean) => void;
	open: boolean;
}>({
	open: false,
});

function createFeedbackResponse(): SubmitFeedbackResponse {
	return {
		feedback: {
			id: "feedback_123",
			organizationId: "org_123",
			websiteId: "site_123",
			conversationId: null,
			visitorId: "visitor_123",
			contactId: null,
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

mock.module("@cossistant/next/feedback", () => ({
	useSubmitFeedback: () => {
		const [error, setError] = React.useState<Error | null>(null);
		const [isPending, setIsPending] = React.useState(false);

		return {
			error,
			isPending,
			mutateAsync: async (variables: SubmitFeedbackVariables) => {
				setIsPending(true);
				setError(null);
				submittedFeedback.push(variables);
				await Promise.resolve();
				setIsPending(false);

				if (shouldReject) {
					const nextError = new Error("Feedback service is unavailable.");
					setError(nextError);
					throw nextError;
				}

				return createFeedbackResponse();
			},
			reset: () => {
				setError(null);
				setIsPending(false);
			},
		};
	},
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props} type={props.type ?? "button"}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/popover", () => ({
	Popover: ({
		children,
		onOpenChange,
		open = false,
	}: {
		children: React.ReactNode;
		onOpenChange?: (open: boolean) => void;
		open?: boolean;
	}) => (
		<PopoverContext.Provider value={{ onOpenChange, open }}>
			{children}
		</PopoverContext.Provider>
	),
	PopoverTrigger: ({
		children,
	}: {
		children: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
	}) => {
		const context = React.useContext(PopoverContext);

		return React.cloneElement(children, {
			onClick: (event) => {
				children.props.onClick?.(event);
				context.onOpenChange?.(!context.open);
			},
		});
	},
	PopoverContent: ({
		align: _align,
		children,
		"data-slot": dataSlot,
		side: _side,
		sideOffset: _sideOffset,
		...props
	}: React.HTMLAttributes<HTMLDivElement> & {
		align?: "start" | "center" | "end";
		"data-slot"?: string;
		side?: "top" | "right" | "bottom" | "left";
		sideOffset?: number;
	}) => {
		const context = React.useContext(PopoverContext);

		if (!context.open) {
			return null;
		}

		return (
			<div {...props} data-slot={dataSlot ?? "mock-popover-content"}>
				{children}
			</div>
		);
	},
}));

const modulePromise = import("./dashboard-feedback-popover");

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
	"HTMLButtonElement",
	"HTMLSelectElement",
	"HTMLTextAreaElement",
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
	setGlobalValue("HTMLButtonElement", window.HTMLButtonElement);
	setGlobalValue("HTMLSelectElement", window.HTMLSelectElement);
	setGlobalValue("HTMLTextAreaElement", window.HTMLTextAreaElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

async function renderPopover() {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { DashboardFeedbackPopover } = await modulePromise;

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(<DashboardFeedbackPopover />);
	});
}

function getBySlot(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);

	if (!element) {
		throw new Error(`Could not find [data-slot="${slot}"]`);
	}

	return element;
}

function click(element: HTMLElement) {
	element.click();
}

function changeSelect(value: string) {
	const select = document.querySelector<HTMLSelectElement>(
		"#dashboard-feedback-topic"
	);

	if (!select) {
		throw new Error("Could not find topic select");
	}

	select.value = value;
	select.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function inputComment(value: string) {
	const textarea = document.querySelector<HTMLTextAreaElement>(
		"#dashboard-feedback-comment"
	);

	if (!textarea) {
		throw new Error("Could not find comment input");
	}

	const valueSetter = Object.getOwnPropertyDescriptor(
		window.HTMLTextAreaElement.prototype,
		"value"
	)?.set;

	valueSetter?.call(textarea, value);
	textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function clickRating(value: number) {
	const button = document.querySelector<HTMLButtonElement>(
		`[data-rating-value="${value}"]`
	);

	if (!button) {
		throw new Error(`Could not find rating ${value}`);
	}

	click(button);
}

function getButtonByText(text: string): HTMLButtonElement {
	const button = Array.from(document.querySelectorAll("button")).find(
		(element) => element.textContent?.trim() === text
	);

	if (!button) {
		throw new Error(`Could not find button with text "${text}"`);
	}

	return button;
}

describe("DashboardFeedbackPopover", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		submittedFeedback.length = 0;
		shouldReject = false;
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

	it("opens from the topbar feedback trigger", async () => {
		await renderPopover();

		expect(document.body.textContent).toContain("Feedback?");
		expect(
			document.querySelector('[data-slot="dashboard-feedback-popover"]')
		).toBeNull();

		const { act } = await import("react");
		await act(async () => {
			click(getBySlot("dashboard-feedback-trigger"));
		});

		expect(document.body.textContent).toContain("Share feedback");
		expect(document.body.textContent).toContain("Bug");
	});

	it("validates topic and rating before submission", async () => {
		await renderPopover();

		const { act } = await import("react");
		await act(async () => {
			click(getBySlot("dashboard-feedback-trigger"));
		});
		await act(async () => {
			click(getBySlot("dashboard-feedback-submit"));
		});

		expect(document.body.textContent).toContain(
			"Select a topic before sending feedback."
		);
		expect(document.body.textContent).toContain(
			"Choose a rating before sending feedback."
		);
		expect(submittedFeedback).toEqual([]);
	});

	it("submits dashboard feedback and shows the success state", async () => {
		await renderPopover();

		const { act } = await import("react");
		await act(async () => {
			click(getBySlot("dashboard-feedback-trigger"));
		});
		await act(async () => {
			changeSelect("Bug");
			inputComment("  The dashboard nav feels jumpy.  ");
			clickRating(5);
		});
		await act(async () => {
			click(getBySlot("dashboard-feedback-submit"));
		});

		expect(submittedFeedback).toEqual([
			{
				rating: 5,
				topic: "Bug",
				comment: "The dashboard nav feels jumpy.",
				trigger: "dashboard_topbar",
			},
		]);
		expect(document.body.textContent).toContain("Thanks for the feedback");
		expect(document.body.textContent).toContain("Send another");
		expect(document.body.textContent).toContain("Done");

		await act(async () => {
			click(getButtonByText("Send another"));
		});

		expect(document.body.textContent).toContain("Share feedback");
		expect(document.body.textContent).not.toContain("Thanks for the feedback");
	});

	it("closes from the success done action", async () => {
		await renderPopover();

		const { act } = await import("react");
		await act(async () => {
			click(getBySlot("dashboard-feedback-trigger"));
		});
		await act(async () => {
			changeSelect("Feature request");
			clickRating(4);
		});
		await act(async () => {
			click(getBySlot("dashboard-feedback-submit"));
		});
		await act(async () => {
			click(getButtonByText("Done"));
		});

		expect(
			document.querySelector('[data-slot="dashboard-feedback-popover"]')
		).toBeNull();
	});

	it("renders submission errors from the hook", async () => {
		shouldReject = true;
		await renderPopover();

		const { act } = await import("react");
		await act(async () => {
			click(getBySlot("dashboard-feedback-trigger"));
		});
		await act(async () => {
			changeSelect("UX");
			clickRating(3);
		});
		await act(async () => {
			click(getBySlot("dashboard-feedback-submit"));
		});

		expect(document.body.textContent).toContain(
			"Feedback service is unavailable."
		);
	});

	it("clears stale submission errors when the form changes", async () => {
		shouldReject = true;
		await renderPopover();

		const { act } = await import("react");
		await act(async () => {
			click(getBySlot("dashboard-feedback-trigger"));
		});
		await act(async () => {
			changeSelect("UX");
			clickRating(3);
		});
		await act(async () => {
			click(getBySlot("dashboard-feedback-submit"));
		});

		expect(document.body.textContent).toContain(
			"Feedback service is unavailable."
		);

		await act(async () => {
			changeSelect("Other");
		});

		expect(document.body.textContent).not.toContain(
			"Feedback service is unavailable."
		);
	});
});
