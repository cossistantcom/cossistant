import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import type React from "react";
import {
	buildKnowledgeClarificationAnswerDraftPersistenceId,
	useKnowledgeClarificationAnswerDraft,
} from "./question-flow";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;

const installedGlobalKeys = [
	"window",
	"self",
	"document",
	"navigator",
	"Document",
	"Element",
	"Event",
	"CustomEvent",
	"EventTarget",
	"HTMLElement",
	"MutationObserver",
	"Node",
	"Text",
	"getComputedStyle",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(window: Window) {
	setGlobalValue("window", window);
	setGlobalValue("self", window);
	setGlobalValue("document", window.document);
	setGlobalValue("navigator", window.navigator);
	setGlobalValue("Document", window.Document);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("CustomEvent", window.CustomEvent);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("MutationObserver", window.MutationObserver);
	setGlobalValue("Node", window.Node);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("requestAnimationFrame", (callback: FrameRequestCallback) =>
		window.setTimeout(() => callback(Date.now()), 0)
	);
	setGlobalValue(
		"cancelAnimationFrame",
		(id: ReturnType<typeof window.setTimeout>) => window.clearTimeout(id)
	);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

async function renderDraftHook(params: {
	question: string;
	inputMode?: "textarea_first" | "suggested_answers";
	draftPersistenceId?: string | null;
}) {
	let hookValue: ReturnType<
		typeof useKnowledgeClarificationAnswerDraft
	> | null = null;

	function Harness() {
		hookValue = useKnowledgeClarificationAnswerDraft(
			params.question,
			params.inputMode,
			params.draftPersistenceId
		);
		return null;
	}

	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(<Harness />);
	});

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return {
		getValue: () => {
			if (!hookValue) {
				throw new Error("Hook value missing");
			}

			return hookValue;
		},
	};
}

describe("useKnowledgeClarificationAnswerDraft persistence", () => {
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

	it("restores a persisted free-text answer after remount", async () => {
		const draftPersistenceId =
			buildKnowledgeClarificationAnswerDraftPersistenceId({
				websiteSlug: "acme",
				requestId: "req_1",
				stepIndex: 2,
			});

		const firstRender = await renderDraftHook({
			question: "How does billing work today?",
			inputMode: "textarea_first",
			draftPersistenceId,
		});
		const { act } = await import("react");

		await act(async () => {
			firstRender
				.getValue()
				.setFreeAnswer("Billing changes apply at the next cycle.");
		});

		await act(async () => {
			activeRoot?.unmount();
		});
		mountNode?.remove();
		activeRoot = null;
		mountNode = null;

		const secondRender = await renderDraftHook({
			question: "How does billing work today?",
			inputMode: "textarea_first",
			draftPersistenceId,
		});

		expect(secondRender.getValue().freeAnswer).toBe(
			"Billing changes apply at the next cycle."
		);
		expect(secondRender.getValue().selectedAnswer).toBeNull();
	});
});
