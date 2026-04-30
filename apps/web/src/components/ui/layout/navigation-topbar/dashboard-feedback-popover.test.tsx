import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { readFile } from "node:fs/promises";
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
const SelectContext = React.createContext<{
	disabled?: boolean;
	onValueChange?: (value: string) => void;
	value: string;
}>({
	value: "",
});
const ToggleGroupContext = React.createContext<{
	onValueChange?: (value: string) => void;
	value: string;
}>({
	value: "",
});

mock.module("@cossistant/next/feedback", () => ({
	useFeedbackForm: ({
		commentRequired = false,
		topics = [],
		trigger,
	}: {
		commentRequired?: boolean;
		topics?: string[];
		trigger?: string;
	}) => {
		const [open, setOpen] = React.useState(false);
		const [rating, setRating] = React.useState<number | null>(null);
		const [hoveredRating, setHoveredRating] = React.useState<number | null>(
			null
		);
		const [topic, setTopic] = React.useState("");
		const [comment, setComment] = React.useState("");
		const [hasSubmitted, setHasSubmitted] = React.useState(false);
		const [hasAttemptedSubmit, setHasAttemptedSubmit] = React.useState(false);
		const [error, setError] = React.useState<Error | null>(null);
		const [isPending, setIsPending] = React.useState(false);
		const normalizedTopic = topic.trim();
		const normalizedComment = comment.trim();
		const rawIsRatingMissing = rating == null;
		const rawIsTopicMissing = topics.length > 0 && normalizedTopic.length === 0;
		const rawIsCommentMissing =
			commentRequired && normalizedComment.length === 0;
		const isValid = !(
			rawIsRatingMissing ||
			rawIsTopicMissing ||
			rawIsCommentMissing
		);
		const canSubmit = isValid && !isPending;
		const canAttemptSubmit = !isPending && (!hasAttemptedSubmit || isValid);
		const isRatingMissing = hasAttemptedSubmit && rawIsRatingMissing;
		const isTopicMissing = hasAttemptedSubmit && rawIsTopicMissing;
		const isCommentMissing = hasAttemptedSubmit && rawIsCommentMissing;
		const submitError =
			error?.message ||
			(error ? "We could not submit your feedback. Please try again." : null);
		const fields = {
			comment: {
				error: isCommentMissing
					? "Add a message before sending feedback."
					: null,
				isMissing: isCommentMissing,
			},
			rating: {
				displayValue: hoveredRating ?? rating,
				error: isRatingMissing
					? "Choose a rating before sending feedback."
					: null,
				isMissing: isRatingMissing,
				selectedValue: rating?.toString() ?? "",
			},
			topic: {
				error: isTopicMissing
					? "Select a topic before sending feedback."
					: null,
				isMissing: isTopicMissing,
			},
		};
		const submit = {
			canAttemptSubmit,
			canSubmit,
			disabled: !canAttemptSubmit,
			label: isPending
				? "Sending..."
				: rawIsRatingMissing
					? "Rating needed"
					: "Send",
		};

		const resetForm = () => {
			setRating(null);
			setHoveredRating(null);
			setTopic("");
			setComment("");
			setHasSubmitted(false);
			setHasAttemptedSubmit(false);
			setError(null);
			setIsPending(false);
		};

		const handleOpenChange = (nextOpen: boolean) => {
			setOpen(nextOpen);

			if (!nextOpen) {
				resetForm();
			}
		};

		const clearSubmitError = () => {
			if (error) {
				setError(null);
			}
		};

		return {
			availableTopics: topics,
			canSubmit,
			comment,
			done: () => handleOpenChange(false),
			error,
			fields,
			handleCommentChange: (value: string) => {
				clearSubmitError();
				setComment(value);
			},
			handleOpenChange,
			handleRatingHoverChange: setHoveredRating,
			handleRatingSelect: (value: number) => {
				clearSubmitError();
				setRating(value);
			},
			handleSubmit: async (event?: React.FormEvent<HTMLFormElement>) => {
				event?.preventDefault();
				setHasAttemptedSubmit(true);
				setError(null);

				if (!(isValid && rating)) {
					return;
				}

				setIsPending(true);
				await Promise.resolve();
				setIsPending(false);

				if (shouldReject) {
					setError(new Error("Feedback service is unavailable."));
					return;
				}

				submittedFeedback.push({
					rating,
					topic: normalizedTopic,
					comment: normalizedComment || undefined,
					trigger,
				});
				setHasSubmitted(true);
			},
			handleTopicChange: (value: string) => {
				clearSubmitError();
				setTopic(value);
			},
			hasAttemptedSubmit,
			hasSubmitted,
			hoveredRating,
			isCommentMissing,
			isPending,
			isRatingMissing,
			isTopicMissing,
			normalizedComment,
			normalizedTopic,
			open,
			rating,
			resetForm,
			sendAnother: resetForm,
			setOpen: handleOpenChange,
			submit,
			submitError,
			topic,
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

mock.module("@/components/ui/select", () => ({
	Select: ({
		children,
		disabled,
		onValueChange,
		value = "",
	}: {
		children: React.ReactNode;
		disabled?: boolean;
		onValueChange?: (value: string) => void;
		value?: string;
	}) => (
		<SelectContext.Provider value={{ disabled, onValueChange, value }}>
			<div data-slot="select">{children}</div>
		</SelectContext.Provider>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="select-content">{children}</div>
	),
	SelectItem: ({
		children,
		value,
	}: {
		children: React.ReactNode;
		value: string;
	}) => {
		const context = React.useContext(SelectContext);

		return (
			<button
				data-select-value={value}
				disabled={context.disabled}
				onClick={() => context.onValueChange?.(value)}
				type="button"
			>
				{children}
			</button>
		);
	},
	SelectTrigger: ({
		children,
		disabled,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
		const context = React.useContext(SelectContext);

		return (
			<button {...props} disabled={disabled || context.disabled} type="button">
				{children}
			</button>
		);
	},
	SelectValue: ({ placeholder }: { placeholder?: string }) => {
		const context = React.useContext(SelectContext);

		return <span>{context.value || placeholder}</span>;
	},
}));

mock.module("@/components/ui/textarea", () => ({
	Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
		<textarea {...props} />
	),
}));

mock.module("@/components/ui/toggle-group", () => ({
	ToggleGroup: ({
		children,
		onValueChange,
		type: _type,
		value = "",
		...props
	}: React.HTMLAttributes<HTMLDivElement> & {
		onValueChange?: (value: string) => void;
		type?: "single";
		value?: string;
	}) => (
		<ToggleGroupContext.Provider value={{ onValueChange, value }}>
			<div {...props}>{children}</div>
		</ToggleGroupContext.Provider>
	),
	ToggleGroupItem: ({
		children,
		onMouseEnter,
		onMouseLeave,
		value,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) => {
		const context = React.useContext(ToggleGroupContext);
		const active = context.value === value;

		return (
			<button
				{...props}
				data-state={active ? "on" : "off"}
				onClick={(event) => {
					props.onClick?.(event);
					context.onValueChange?.(active ? "" : value);
				}}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
				type="button"
				value={value}
			>
				{children}
			</button>
		);
	},
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
	const option = document.querySelector<HTMLButtonElement>(
		`[data-select-value="${value}"]`
	);

	if (!option) {
		throw new Error(`Could not find topic option ${value}`);
	}

	click(option);
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

	it("uses shadcn controls instead of Cossistant feedback primitives", async () => {
		const source = await readFile(
			new URL("./dashboard-feedback-popover.tsx", import.meta.url),
			"utf8"
		);

		expect(source).not.toContain("@cossistant/next/primitives");
		expect(source).not.toContain("FeedbackTopicSelect");
		expect(source).not.toContain("FeedbackCommentInput");
		expect(source).not.toContain("FeedbackRatingSelector");
		expect(source).toContain("@/components/ui/select");
		expect(source).toContain("@/components/ui/textarea");
		expect(source).toContain("@/components/ui/toggle-group");
		expect(source).not.toContain("rounded");
		expect(source).not.toContain("shadow");
		expect(source).toContain("opacity-45");
		expect(source).toContain("hover:opacity-75");
		expect(source).toContain("opacity-100");
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

		expect(document.body.textContent).toContain("Select topic");
		expect(document.body.textContent).toContain("Bug");
		expect(
			document.querySelector<HTMLTextAreaElement>(
				'[aria-label="Your feedback"]'
			)?.placeholder
		).toBe("Your feedback");
		expect(document.body.textContent).not.toContain("Share feedback");
		expect(document.body.textContent).not.toContain("Topic");
		expect(document.body.textContent).not.toContain("Comment");
		expect(getBySlot("dashboard-feedback-submit").textContent).toBe(
			"Rating needed"
		);
	});

	it("updates the submit label once a rating is selected", async () => {
		await renderPopover();

		const { act } = await import("react");
		await act(async () => {
			click(getBySlot("dashboard-feedback-trigger"));
		});

		const submitButton = getBySlot(
			"dashboard-feedback-submit"
		) as HTMLButtonElement;

		expect(submitButton.textContent).toBe("Rating needed");
		expect(submitButton.disabled).toBe(false);

		await act(async () => {
			clickRating(4);
		});

		expect(submitButton.textContent).toBe("Send");
		expect(submitButton.disabled).toBe(false);
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
		expect(document.body.textContent).toContain(
			"Add a message before sending feedback."
		);
		const topicTrigger = getBySlot("dashboard-feedback-topic");
		expect(topicTrigger.getAttribute("aria-invalid")).toBe("true");
		expect(topicTrigger.className).toContain("border-destructive");
		const textarea = document.querySelector<HTMLTextAreaElement>(
			"#dashboard-feedback-comment"
		);
		expect(textarea?.getAttribute("aria-invalid")).toBe("true");
		expect(textarea?.className).toContain("border-destructive");
		expect(
			(getBySlot("dashboard-feedback-submit") as HTMLButtonElement).disabled
		).toBe(true);
		expect(submittedFeedback).toEqual([]);
	});

	it("blocks empty comments with input-level validation", async () => {
		await renderPopover();

		const { act } = await import("react");
		await act(async () => {
			click(getBySlot("dashboard-feedback-trigger"));
		});
		await act(async () => {
			changeSelect("Bug");
			clickRating(5);
		});
		await act(async () => {
			click(getBySlot("dashboard-feedback-submit"));
		});

		const textarea = document.querySelector<HTMLTextAreaElement>(
			"#dashboard-feedback-comment"
		);

		expect(document.body.textContent).toContain(
			"Add a message before sending feedback."
		);
		expect(textarea?.getAttribute("aria-invalid")).toBe("true");
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

		expect(document.body.textContent).toContain("Select topic");
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
			inputComment("The done action should close the popover.");
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
			inputComment("The dashboard got stuck.");
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
			inputComment("The dashboard got stuck.");
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
