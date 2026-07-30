import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

mock.module("motion/react", () => ({
	motion: {
		div: ({
			children,
			...props
		}: React.HTMLAttributes<HTMLDivElement> & {
			children: React.ReactNode;
		}) => <div {...props}>{children}</div>,
	},
}));

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
		mutateAsync: async () => null,
		isPending: false,
	}),
	// bun's mock.module replaces the whole module, so every export the route's
	// module graph touches has to be present here.
	useQuery: () => ({ data: undefined, isLoading: false }),
	useQueryClient: () => ({
		getQueryState: () => {},
		invalidateQueries: async () => {},
		setQueryData: () => {},
	}),
}));

mock.module("@/contexts/website", () => ({
	useOptionalWebsite: () => null,
}));

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;

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
	"HTMLButtonElement",
	"Image",
	"HTMLInputElement",
	"HTMLSelectElement",
	"MouseEvent",
	"MutationObserver",
	"Node",
	"ResizeObserver",
	"SVGElement",
	"SyntaxError",
	"Text",
	"getComputedStyle",
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
	const syntaxErrorCtor = window.Error ?? Error;
	const resizeObserverCtor =
		window.ResizeObserver ??
		class ResizeObserver {
			disconnect() {}
			observe() {}
			unobserve() {}
		};
	const mutationObserverCtor =
		window.MutationObserver ??
		class MutationObserver {
			disconnect() {}
			observe() {}
			takeRecords() {
				return [];
			}
		};

	setGlobalValue("window", window);
	setGlobalValue("self", window);
	setGlobalValue("document", window.document);
	setGlobalValue("navigator", window.navigator);
	setGlobalValue("Document", window.Document);
	setGlobalValue("DocumentFragment", window.DocumentFragment);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("FocusEvent", window.FocusEvent);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("HTMLButtonElement", window.HTMLButtonElement);
	setGlobalValue("Image", window.Image);
	setGlobalValue("HTMLInputElement", window.HTMLInputElement);
	setGlobalValue("HTMLSelectElement", window.HTMLSelectElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("MutationObserver", mutationObserverCtor);
	setGlobalValue("Node", window.Node);
	setGlobalValue("ResizeObserver", resizeObserverCtor);
	setGlobalValue("SVGElement", window.SVGElement);
	Object.defineProperty(window, "SyntaxError", {
		configurable: true,
		value: syntaxErrorCtor,
		writable: true,
	});
	setGlobalValue("SyntaxError", syntaxErrorCtor);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

function clickPreset(id: string) {
	const button = document.querySelector(
		`button[data-timeline-ui-preset="${id}"]`
	) as HTMLButtonElement | null;

	if (!button) {
		throw new Error(`Missing timeline preset button: ${id}`);
	}

	button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function clickTheme(value: "light" | "dark") {
	const button = document.querySelector(
		`button[data-timeline-ui-theme="${value}"]`
	) as HTMLButtonElement | null;

	if (!button) {
		throw new Error(`Missing timeline theme button: ${value}`);
	}

	button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

describe("TimelineUiTestPage", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		windowInstance = new Window({
			url: "https://example.com/test/ui/timeline",
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

	it("renders the route shell without requiring live dashboard or widget data", async () => {
		const routeModule = await import("./page");
		const html = renderToStaticMarkup(React.createElement(routeModule.default));

		expect(html).toContain("Timeline UI Test");
		expect(html).toContain("Preview Surface Theme");
		expect(html).toContain("page theme in the header");
		expect(html).toContain('data-timeline-ui-controls="true"');
		expect(html).toContain('data-timeline-ui-preview="true"');
		expect(html).toContain('data-timeline-ui-details="true"');
		expect(html).toContain('data-timeline-ui-surface="dashboard"');
		expect(html).toContain('data-timeline-ui-surface="widget"');
		expect(html).not.toContain("useSupportText must be used");
		expect(html).not.toContain("useSupportController must be used");
	});

	it("switches presets, toggles preview theme, and shows widget unsupported states", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { TimelineUiTestPage } = await import("./timeline-ui-test-page");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);

		await act(async () => {
			activeRoot?.render(<TimelineUiTestPage />);
		});

		expect(document.body.innerHTML).toContain("Dashboard Preview");
		expect(document.body.innerHTML).toContain("Widget Preview");

		await act(async () => {
			clickPreset("markdown");
		});
		expect(document.body.innerHTML).toContain('data-co-code-block=""');
		expect(document.body.innerHTML).toContain("app/page.tsx");

		await act(async () => {
			clickTheme("dark");
		});
		expect(document.body.innerHTML).toContain(
			'data-timeline-ui-preview-theme="dark"'
		);

		await act(async () => {
			clickPreset("developer");
		});
		expect(document.body.innerHTML).toContain(
			'data-timeline-ui-widget-unsupported="true"'
		);
		expect(document.body.innerHTML).toContain("Dev logs");
	});
});
