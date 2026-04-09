import type {
	RouteRegistry,
	SupportController,
	SupportControllerEventType,
	SupportControllerOptions,
	SupportControllerSnapshot,
} from "@cossistant/core";
import { createSupportController } from "@cossistant/core/support-controller";
import type { SupportProviderProps } from "@cossistant/react/provider";
import { SupportProvider } from "@cossistant/react/provider";
import type { SupportProps } from "@cossistant/react/support";
import { Support } from "@cossistant/react/support";
import type { DefaultMessage } from "@cossistant/types";
import React from "react";
import { createRoot, type Root } from "react-dom/client";

type BrowserMountParent = Element | ShadowRoot;

export type BrowserSupportContainer = string | BrowserMountParent;

export type BrowserSupportHostOptions = {
	id?: string;
	className?: string;
};

export type BrowserSupportThemeMode = "auto" | "light" | "dark";

export type BrowserSupportThemeOptions = {
	mode?: BrowserSupportThemeMode;
	variables?: Record<string, number | string | null | undefined>;
};

export type BrowserSupportStyleOptions = {
	stylesheetUrl?: string;
	useShadowDom?: boolean;
	shadowMode?: ShadowRootMode;
};

export type BrowserSupportWidgetRenderProps = Omit<
	SupportProps,
	"children" | "theme"
>;

export type BrowserSupportWidgetOptions = {
	container?: BrowserSupportContainer;
	host?: BrowserSupportHostOptions;
	controller?: SupportController;
	provider?: Omit<SupportProviderProps, "children" | "controller">;
	theme?: BrowserSupportThemeOptions;
	style?: BrowserSupportStyleOptions;
	widget?: BrowserSupportWidgetRenderProps;
};

export type BrowserSupportWidgetUpdateOptions = {
	defaultMessages?: DefaultMessage[];
	quickOptions?: string[];
	size?: "normal" | "larger";
	open?: boolean;
	theme?: BrowserSupportThemeOptions;
	widget?: Partial<BrowserSupportWidgetRenderProps>;
};

type BrowserSupportControllerMethod =
	| "refresh"
	| "getState"
	| "getSnapshot"
	| "subscribe"
	| "setDefaultMessages"
	| "setQuickOptions"
	| "setUnreadCount"
	| "open"
	| "close"
	| "toggle"
	| "navigate"
	| "replace"
	| "goBack"
	| "goHome"
	| "openConversation"
	| "startConversation"
	| "identify"
	| "updateVisitorMetadata"
	| "emit"
	| "on"
	| "off";

type BrowserSupportControllerApi = Pick<
	SupportController,
	BrowserSupportControllerMethod
>;

type BrowserMountContext = {
	hostElement: HTMLElement;
	mountElement: HTMLDivElement;
	mountTarget: BrowserMountParent;
	ownsHostElement: boolean;
	shadowRoot: ShadowRoot | null;
};

export type BrowserSupportWidget = BrowserSupportControllerApi & {
	controller: SupportController;
	hostElement: HTMLElement;
	mountElement: HTMLDivElement;
	mountTarget: BrowserMountParent;
	shadowRoot: ShadowRoot | null;
	updateConfig: (options: BrowserSupportWidgetUpdateOptions) => void;
	destroy: () => void;
	show: () => void;
	hide: () => void;
};

export type BrowserSupportWidgetState = SupportControllerSnapshot;

function assertBrowserEnvironment(): Document {
	if (typeof document === "undefined") {
		throw new Error(
			"mountSupportWidget can only run in a browser environment with document access"
		);
	}

	return document;
}

function isShadowRoot(
	value: BrowserMountParent | undefined
): value is ShadowRoot {
	return Boolean(
		value &&
			typeof value === "object" &&
			"host" in value &&
			"appendChild" in value &&
			"nodeType" in value &&
			value.nodeType === 11
	);
}

function resolveMountTarget(
	doc: Document,
	container?: BrowserSupportContainer
): BrowserMountParent {
	if (!container) {
		return doc.body;
	}

	if (typeof container === "string") {
		const resolved = doc.querySelector(container);
		if (!resolved) {
			throw new Error(
				`mountSupportWidget could not find a container matching "${container}"`
			);
		}

		return resolved;
	}

	return container;
}

function createHostElement(
	doc: Document,
	host: BrowserSupportHostOptions | undefined
): HTMLDivElement {
	const element = doc.createElement("div");
	element.dataset.cossistantBrowserWidget = "true";

	if (host?.id) {
		element.id = host.id;
	}

	if (host?.className) {
		element.className = host.className;
	}

	return element;
}

function createMountContext(
	doc: Document,
	mountTarget: BrowserMountParent,
	host: BrowserSupportHostOptions | undefined,
	style: BrowserSupportStyleOptions | undefined
): BrowserMountContext {
	const mountElement = doc.createElement("div");

	if (isShadowRoot(mountTarget)) {
		mountTarget.appendChild(mountElement);
		return {
			hostElement:
				mountTarget.host instanceof HTMLElement
					? mountTarget.host
					: createHostElement(doc, host),
			mountElement,
			mountTarget,
			ownsHostElement: false,
			shadowRoot: mountTarget,
		};
	}

	const hostElement = createHostElement(doc, host);
	mountTarget.appendChild(hostElement);

	if (style?.useShadowDom === false) {
		hostElement.appendChild(mountElement);
		return {
			hostElement,
			mountElement,
			mountTarget,
			ownsHostElement: true,
			shadowRoot: null,
		};
	}

	const shadowRoot = hostElement.attachShadow({
		mode: style?.shadowMode ?? "open",
	});
	shadowRoot.appendChild(mountElement);

	return {
		hostElement,
		mountElement,
		mountTarget,
		ownsHostElement: true,
		shadowRoot,
	};
}

function removeNode(node: {
	parentNode?: ParentNode | null;
	remove?: () => void;
}) {
	if (typeof node.remove === "function") {
		node.remove();
		return;
	}

	node.parentNode?.removeChild(node as Node);
}

function injectStylesheet(
	doc: Document,
	context: BrowserMountContext,
	style: BrowserSupportStyleOptions | undefined
): HTMLLinkElement | null {
	if (!(style?.stylesheetUrl && context.shadowRoot)) {
		return null;
	}

	const link = doc.createElement("link");
	link.rel = "stylesheet";
	link.href = style.stylesheetUrl;
	link.dataset.cossistantBrowserWidgetStylesheet = "true";
	context.shadowRoot.appendChild(link);
	return link;
}

function detectAutoTheme(doc: Document): "light" | "dark" {
	const root = doc.documentElement;
	if (!root) {
		return "light";
	}

	if (
		root.classList.contains("dark") ||
		root.getAttribute("data-color-scheme") === "dark" ||
		root.getAttribute("data-theme") === "dark"
	) {
		return "dark";
	}

	if (
		typeof window !== "undefined" &&
		typeof window.getComputedStyle === "function"
	) {
		const colorScheme = window.getComputedStyle(root).colorScheme;
		if (colorScheme.includes("dark")) {
			return "dark";
		}
	}

	if (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-color-scheme: dark)").matches
	) {
		return "dark";
	}

	return "light";
}

function resolveThemeMode(
	doc: Document,
	theme: BrowserSupportThemeOptions | undefined
): "light" | "dark" {
	if (theme?.mode === "dark") {
		return "dark";
	}

	if (theme?.mode === "light") {
		return "light";
	}

	return detectAutoTheme(doc);
}

function applyThemeVariables(
	hostElement: HTMLElement,
	previousKeys: Set<string>,
	theme: BrowserSupportThemeOptions | undefined
) {
	for (const key of previousKeys) {
		hostElement.style.removeProperty(key);
	}
	previousKeys.clear();

	for (const [key, value] of Object.entries(theme?.variables ?? {})) {
		if (value === null || value === undefined) {
			hostElement.style.removeProperty(key);
			continue;
		}

		hostElement.style.setProperty(key, String(value));
		previousKeys.add(key);
	}
}

function createThemeObserver(
	doc: Document,
	theme: BrowserSupportThemeOptions | undefined,
	onChange: () => void
): () => void {
	if (theme?.mode && theme.mode !== "auto") {
		return () => {};
	}

	const root = doc.documentElement;
	if (!root || typeof MutationObserver === "undefined") {
		return () => {};
	}

	const observer = new MutationObserver(() => {
		onChange();
	});

	observer.observe(root, {
		attributeFilter: ["class", "data-color-scheme", "data-theme", "style"],
		attributes: true,
	});

	let removeMatchMediaListener = () => {};

	if (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function"
	) {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const listener = () => {
			onChange();
		};

		if (typeof mediaQuery.addEventListener === "function") {
			mediaQuery.addEventListener("change", listener);
			removeMatchMediaListener = () => {
				mediaQuery.removeEventListener("change", listener);
			};
		} else if (typeof mediaQuery.addListener === "function") {
			mediaQuery.addListener(listener);
			removeMatchMediaListener = () => {
				mediaQuery.removeListener(listener);
			};
		}
	}

	return () => {
		observer.disconnect();
		removeMatchMediaListener();
	};
}

function renderWidget(options: {
	root: Root;
	controller: SupportController;
	provider: BrowserSupportWidgetOptions["provider"];
	widget: BrowserSupportWidgetRenderProps;
	themeMode: "light" | "dark";
}) {
	const { root, controller, provider, widget, themeMode } = options;

	root.render(
		React.createElement(
			SupportProvider,
			{
				...provider,
				controller,
			},
			React.createElement(Support, {
				...widget,
				theme: themeMode === "dark" ? "dark" : undefined,
			})
		)
	);
}

function pickControllerApi(
	controller: SupportController
): BrowserSupportControllerApi {
	return {
		refresh: controller.refresh,
		getState: controller.getState,
		getSnapshot: controller.getSnapshot,
		subscribe: controller.subscribe,
		setDefaultMessages: controller.setDefaultMessages,
		setQuickOptions: controller.setQuickOptions,
		setUnreadCount: controller.setUnreadCount,
		open: controller.open,
		close: controller.close,
		toggle: controller.toggle,
		navigate: controller.navigate,
		replace: controller.replace,
		goBack: controller.goBack,
		goHome: controller.goHome,
		openConversation: controller.openConversation,
		startConversation: controller.startConversation,
		identify: controller.identify,
		updateVisitorMetadata: controller.updateVisitorMetadata,
		emit: controller.emit,
		on: controller.on,
		off: controller.off,
	};
}

function mergeThemeOptions(
	currentTheme: BrowserSupportThemeOptions | undefined,
	nextTheme: BrowserSupportThemeOptions | undefined
): BrowserSupportThemeOptions | undefined {
	if (!(currentTheme || nextTheme)) {
		return;
	}

	return {
		mode: nextTheme?.mode ?? currentTheme?.mode,
		variables:
			nextTheme?.variables === undefined
				? currentTheme?.variables
				: {
						...(currentTheme?.variables ?? {}),
						...nextTheme.variables,
					},
	};
}

export function mountSupportWidget(
	options: BrowserSupportWidgetOptions = {}
): BrowserSupportWidget {
	const doc = assertBrowserEnvironment();
	const mountTarget = resolveMountTarget(doc, options.container);
	const mountContext = createMountContext(
		doc,
		mountTarget,
		options.host,
		options.style
	);
	const stylesheetLink = injectStylesheet(doc, mountContext, options.style);
	const ownsController = options.controller === undefined;
	const controller =
		options.controller ??
		createSupportController(options.provider as SupportControllerOptions);
	const root = createRoot(mountContext.mountElement);
	const controllerApi = pickControllerApi(controller);
	const appliedThemeVariableKeys = new Set<string>();

	let currentProvider = { ...(options.provider ?? {}) };
	let currentTheme = options.theme;
	let currentWidget: BrowserSupportWidgetRenderProps = {
		...(options.widget ?? {}),
	};
	let themeObserverCleanup = () => {};
	let destroyed = false;

	const syncTheme = () => {
		applyThemeVariables(
			mountContext.hostElement,
			appliedThemeVariableKeys,
			currentTheme
		);
		const themeMode = resolveThemeMode(doc, currentTheme);
		renderWidget({
			root,
			controller,
			provider: currentProvider,
			widget: currentWidget,
			themeMode,
		});
	};

	const resetThemeObserver = () => {
		themeObserverCleanup();
		themeObserverCleanup = createThemeObserver(doc, currentTheme, syncTheme);
	};

	resetThemeObserver();
	syncTheme();

	return {
		...controllerApi,
		controller,
		hostElement: mountContext.hostElement,
		mountElement: mountContext.mountElement,
		mountTarget,
		shadowRoot: mountContext.shadowRoot,
		show: controller.open,
		hide: controller.close,
		updateConfig: (nextOptions) => {
			if (nextOptions.defaultMessages !== undefined) {
				currentProvider = {
					...currentProvider,
					defaultMessages: nextOptions.defaultMessages,
				};
				controller.setDefaultMessages(nextOptions.defaultMessages);
			}

			if (nextOptions.quickOptions !== undefined) {
				currentProvider = {
					...currentProvider,
					quickOptions: nextOptions.quickOptions,
				};
				controller.setQuickOptions(nextOptions.quickOptions);
			}

			if (nextOptions.size !== undefined) {
				currentProvider = {
					...currentProvider,
					size: nextOptions.size,
				};
				controller.updateSupportConfig({ size: nextOptions.size });
			}

			if (nextOptions.open !== undefined) {
				controller.updateSupportConfig({ isOpen: nextOptions.open });
			}

			if (nextOptions.widget) {
				currentWidget = {
					...currentWidget,
					...nextOptions.widget,
				};
			}

			if (nextOptions.theme) {
				currentTheme = mergeThemeOptions(currentTheme, nextOptions.theme);
				resetThemeObserver();
			}

			syncTheme();
		},
		destroy: () => {
			if (destroyed) {
				return;
			}

			destroyed = true;
			themeObserverCleanup();
			root.unmount();
			if (ownsController) {
				controller.destroy();
			}
			removeNode(mountContext.mountElement);
			if (stylesheetLink) {
				removeNode(stylesheetLink);
			}
			if (mountContext.ownsHostElement) {
				removeNode(mountContext.hostElement);
			}
		},
	};
}

export type BrowserSupportEventType = SupportControllerEventType;
export type BrowserSupportRouteRegistry = RouteRegistry;
