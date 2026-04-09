import type {
	SupportControllerEvent,
	SupportControllerEventType,
} from "@cossistant/core";
import type { DefaultMessage } from "@cossistant/types";
import {
	type BrowserSupportContainer,
	type BrowserSupportHostOptions,
	type BrowserSupportThemeOptions,
	type BrowserSupportWidget,
	type BrowserSupportWidgetRenderProps,
	type BrowserSupportWidgetUpdateOptions,
	mountSupportWidget,
} from "../mount-support-widget";
import { resolveBrowserEmbedAssetUrlsFromDocument } from "./asset-urls";

export type CossistantBrowserInitOptions = {
	apiUrl?: string;
	autoConnect?: boolean;
	container?: BrowserSupportContainer;
	defaultMessages?: DefaultMessage[];
	defaultOpen?: boolean;
	host?: BrowserSupportHostOptions;
	publicKey?: string;
	quickOptions?: string[];
	size?: "normal" | "larger";
	theme?: BrowserSupportThemeOptions;
	widget?: Partial<BrowserSupportWidgetRenderProps>;
	wsUrl?: string;
};

export type CossistantBrowserUpdateConfigOptions =
	BrowserSupportWidgetUpdateOptions;

type EventSubscription = {
	handler: (event: SupportControllerEvent) => void;
	type: SupportControllerEventType;
	unsubscribe?: () => void;
};

type BrowserLoaderCall = {
	args: unknown[];
	method:
		| "destroy"
		| "hide"
		| "identify"
		| "init"
		| "off"
		| "on"
		| "show"
		| "toggle"
		| "updateConfig";
};

type BrowserLoaderStub = {
	__assets?: {
		cssUrl: string;
		widgetUrl: string;
	};
	__queue?: BrowserLoaderCall[];
};

export type CossistantBrowserGlobal = {
	destroy: () => void;
	hide: () => void;
	identify: BrowserSupportWidget["identify"];
	init: (options?: CossistantBrowserInitOptions) => BrowserSupportWidget;
	off: (
		type: SupportControllerEventType,
		handler: (event: SupportControllerEvent) => void
	) => void;
	on: (
		type: SupportControllerEventType,
		handler: (event: SupportControllerEvent) => void
	) => () => void;
	show: () => void;
	toggle: () => void;
	updateConfig: (options: CossistantBrowserUpdateConfigOptions) => void;
};

type BrowserRuntimeApi = CossistantBrowserGlobal & {
	__isCossistantBrowserRuntime: true;
};

type BrowserRuntimeWindow = Window & {
	__COSSISTANT_BROWSER_WIDGET_LOADER__?: {
		assets?: {
			cssUrl: string;
			widgetUrl: string;
		};
		isLoading?: boolean;
	};
	Cossistant?: BrowserLoaderStub | BrowserRuntimeApi;
};

function normalizeInitOptions(
	options: CossistantBrowserInitOptions | undefined,
	stylesheetUrl: string
) {
	return {
		container: options?.container,
		host: options?.host,
		provider: {
			apiUrl: options?.apiUrl,
			autoConnect: options?.autoConnect,
			defaultMessages: options?.defaultMessages,
			defaultOpen: options?.defaultOpen,
			publicKey: options?.publicKey,
			quickOptions: options?.quickOptions,
			size: options?.size,
			wsUrl: options?.wsUrl,
		},
		style: {
			shadowMode: "open" as const,
			stylesheetUrl,
			useShadowDom: true,
		},
		theme: options?.theme,
		widget: options?.widget,
	};
}

function normalizeUpdateOptions(
	options: CossistantBrowserInitOptions | CossistantBrowserUpdateConfigOptions
): CossistantBrowserUpdateConfigOptions {
	return {
		defaultMessages: options.defaultMessages,
		open:
			"defaultOpen" in options
				? options.defaultOpen
				: "open" in options
					? options.open
					: undefined,
		quickOptions: options.quickOptions,
		size: options.size,
		theme: options.theme,
		widget: options.widget,
	};
}

function requireWidget(widget: BrowserSupportWidget | null, method: string) {
	if (!widget) {
		throw new Error(
			`window.Cossistant.${method}() requires window.Cossistant.init() to be called first`
		);
	}

	return widget;
}

export function installCossistantBrowserRuntime() {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return;
	}

	const globalWindow = window as BrowserRuntimeWindow;
	const existing =
		(globalWindow.Cossistant as BrowserLoaderStub | undefined) ?? undefined;

	if (
		existing &&
		typeof existing === "object" &&
		"__isCossistantBrowserRuntime" in existing
	) {
		return existing;
	}

	const assets =
		existing?.__assets ??
		globalWindow.__COSSISTANT_BROWSER_WIDGET_LOADER__?.assets ??
		resolveBrowserEmbedAssetUrlsFromDocument(document);

	if (!assets) {
		throw new Error(
			"Unable to resolve browser widget assets because the loader metadata is missing"
		);
	}

	let widget: BrowserSupportWidget | null = null;
	let pendingConfig: CossistantBrowserInitOptions = {};
	const subscriptions: EventSubscription[] = [];

	const attachSubscription = (subscription: EventSubscription) => {
		if (!widget || subscription.unsubscribe) {
			return;
		}

		subscription.unsubscribe = widget.on(
			subscription.type,
			subscription.handler as Parameters<BrowserSupportWidget["on"]>[1]
		);
	};

	const attachAllSubscriptions = () => {
		for (const subscription of subscriptions) {
			attachSubscription(subscription);
		}
	};

	const api: BrowserRuntimeApi = {
		__isCossistantBrowserRuntime: true,
		init(options = {}) {
			const merged = {
				...pendingConfig,
				...options,
				theme: {
					...(pendingConfig.theme ?? {}),
					...(options.theme ?? {}),
					variables: {
						...(pendingConfig.theme?.variables ?? {}),
						...(options.theme?.variables ?? {}),
					},
				},
				widget: {
					...(pendingConfig.widget ?? {}),
					...(options.widget ?? {}),
				},
			} satisfies CossistantBrowserInitOptions;

			if (widget) {
				widget.updateConfig(normalizeUpdateOptions(merged));
			} else {
				widget = mountSupportWidget(
					normalizeInitOptions(merged, assets.cssUrl)
				);
				attachAllSubscriptions();
			}

			pendingConfig = {};
			return widget;
		},
		show() {
			requireWidget(widget, "show").show();
		},
		hide() {
			requireWidget(widget, "hide").hide();
		},
		toggle() {
			requireWidget(widget, "toggle").toggle();
		},
		identify(params) {
			return requireWidget(widget, "identify").identify(params);
		},
		updateConfig(options) {
			if (!widget) {
				pendingConfig = {
					...pendingConfig,
					...options,
					theme: {
						...(pendingConfig.theme ?? {}),
						...(options.theme ?? {}),
						variables: {
							...(pendingConfig.theme?.variables ?? {}),
							...(options.theme?.variables ?? {}),
						},
					},
					widget: {
						...(pendingConfig.widget ?? {}),
						...(options.widget ?? {}),
					},
				};
				return;
			}

			widget.updateConfig(options);
		},
		destroy() {
			if (!widget) {
				pendingConfig = {};
				return;
			}

			for (const subscription of subscriptions) {
				subscription.unsubscribe?.();
				subscription.unsubscribe = undefined;
			}

			widget.destroy();
			widget = null;
			pendingConfig = {};
		},
		on(type, handler) {
			const subscription: EventSubscription = {
				handler,
				type,
			};

			subscriptions.push(subscription);
			attachSubscription(subscription);

			return () => {
				subscription.unsubscribe?.();
				const index = subscriptions.indexOf(subscription);
				if (index >= 0) {
					subscriptions.splice(index, 1);
				}
			};
		},
		off(type, handler) {
			for (const subscription of [...subscriptions]) {
				if (subscription.type !== type || subscription.handler !== handler) {
					continue;
				}

				subscription.unsubscribe?.();
				const index = subscriptions.indexOf(subscription);
				if (index >= 0) {
					subscriptions.splice(index, 1);
				}
			}
		},
	};

	globalWindow.Cossistant = api;
	globalWindow.__COSSISTANT_BROWSER_WIDGET_LOADER__ = {
		assets,
		isLoading: false,
	};

	for (const queuedCall of existing?.__queue ?? []) {
		const method = api[queuedCall.method];
		if (typeof method === "function") {
			(method as (...args: unknown[]) => unknown)(...queuedCall.args);
		}
	}

	return api;
}
