import { beforeEach, describe, expect, it, mock } from "bun:test";
import { installCossistantBrowserLoader } from "./loader-runtime";

type MockScriptElement = {
	async: boolean;
	crossOrigin: string | null;
	src: string;
};

describe("installCossistantBrowserLoader", () => {
	let appendedScripts: MockScriptElement[];

	beforeEach(() => {
		appendedScripts = [];

		Object.defineProperty(globalThis, "window", {
			value: {},
			configurable: true,
		});

		Object.defineProperty(globalThis, "document", {
			value: {
				createElement: mock(() => ({
					async: false,
					crossOrigin: null,
					src: "",
				})),
				currentScript: {
					src: "https://cdn.cossistant.com/widget/0.1.2/loader.js",
				},
				head: {
					appendChild: mock((script: MockScriptElement) => {
						appendedScripts.push(script);
					}),
				},
			},
			configurable: true,
		});
	});

	it("creates a queueing global stub and injects widget.js from the same directory", () => {
		installCossistantBrowserLoader();

		const runtime = (window as typeof window & { Cossistant: any }).Cossistant;

		runtime.init({ publicKey: "pk_test_browser" });
		runtime.show();

		expect(runtime.__isCossistantLoaderStub).toBe(true);
		expect(runtime.__assets.cssUrl).toBe(
			"https://cdn.cossistant.com/widget/0.1.2/widget.css"
		);
		expect(runtime.__queue).toEqual([
			{
				args: [{ publicKey: "pk_test_browser" }],
				method: "init",
			},
			{
				args: [],
				method: "show",
			},
		]);
		expect(appendedScripts).toEqual([
			{
				async: true,
				crossOrigin: "anonymous",
				src: "https://cdn.cossistant.com/widget/0.1.2/widget.js",
			},
		]);
	});

	it("does not re-queue or re-load the widget bundle after the runtime is installed", () => {
		(window as typeof window & { Cossistant: any }).Cossistant = {
			__isCossistantBrowserRuntime: true,
			init: () => {},
		};

		installCossistantBrowserLoader();

		expect(appendedScripts).toEqual([]);
		expect(
			(window as typeof window & { __COSSISTANT_BROWSER_WIDGET_LOADER__: any })
				.__COSSISTANT_BROWSER_WIDGET_LOADER__
		).toEqual({
			assets: {
				baseUrl: "https://cdn.cossistant.com/widget/0.1.2/",
				cssUrl: "https://cdn.cossistant.com/widget/0.1.2/widget.css",
				loaderUrl: "https://cdn.cossistant.com/widget/0.1.2/loader.js",
				widgetUrl: "https://cdn.cossistant.com/widget/0.1.2/widget.js",
			},
			isLoading: false,
		});
	});
});
