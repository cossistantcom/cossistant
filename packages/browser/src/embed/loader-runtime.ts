import {
	type BrowserEmbedAssetUrls,
	resolveBrowserEmbedAssetUrlsFromDocument,
} from "./asset-urls";

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
	__assets: BrowserEmbedAssetUrls;
	__isCossistantLoaderStub: true;
	__queue: BrowserLoaderCall[];
	destroy: (...args: unknown[]) => void;
	hide: (...args: unknown[]) => void;
	identify: (...args: unknown[]) => void;
	init: (...args: unknown[]) => void;
	off: (...args: unknown[]) => void;
	on: (...args: unknown[]) => void;
	show: (...args: unknown[]) => void;
	toggle: (...args: unknown[]) => void;
	updateConfig: (...args: unknown[]) => void;
};

type BrowserLoaderWindow = Window & {
	__COSSISTANT_BROWSER_WIDGET_LOADER__?: {
		assets: BrowserEmbedAssetUrls;
		isLoading: boolean;
	};
	Cossistant?:
		| BrowserLoaderStub
		| {
				__isCossistantBrowserRuntime?: true;
		  };
};

const LOADER_METHODS = [
	"destroy",
	"hide",
	"identify",
	"init",
	"off",
	"on",
	"show",
	"toggle",
	"updateConfig",
] as const;

function createLoaderStub(assets: BrowserEmbedAssetUrls): BrowserLoaderStub {
	const queue: BrowserLoaderCall[] = [];

	const stub = {
		__assets: assets,
		__isCossistantLoaderStub: true,
		__queue: queue,
	} as BrowserLoaderStub;

	for (const method of LOADER_METHODS) {
		stub[method] = (...args: unknown[]) => {
			queue.push({
				args,
				method,
			});
		};
	}

	return stub;
}

export function installCossistantBrowserLoader() {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return;
	}

	const globalWindow = window as BrowserLoaderWindow;
	const assets = resolveBrowserEmbedAssetUrlsFromDocument(document);

	if (!assets) {
		throw new Error(
			"Unable to resolve browser embed assets because document.currentScript is unavailable"
		);
	}

	if (globalWindow.__COSSISTANT_BROWSER_WIDGET_LOADER__?.isLoading) {
		return;
	}

	const existing = globalWindow.Cossistant;

	if (
		existing &&
		typeof existing === "object" &&
		"__isCossistantBrowserRuntime" in existing
	) {
		globalWindow.__COSSISTANT_BROWSER_WIDGET_LOADER__ = {
			assets,
			isLoading: false,
		};
		return;
	}

	const stub =
		existing && "__queue" in existing && "__assets" in existing
			? existing
			: createLoaderStub(assets);

	stub.__assets = assets;
	globalWindow.Cossistant = stub;
	globalWindow.__COSSISTANT_BROWSER_WIDGET_LOADER__ = {
		assets,
		isLoading: true,
	};

	const script = document.createElement("script");
	script.async = true;
	script.crossOrigin = "anonymous";
	script.src = assets.widgetUrl;
	document.head.appendChild(script);
}
