import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

function createMockWidget() {
	return {
		destroy: mock(() => {}),
		hide: mock(() => {}),
		identify: mock(async () => null),
		off: mock(() => {}),
		on: mock(() => () => {}),
		show: mock(() => {}),
		toggle: mock(() => {}),
		updateConfig: mock(() => {}),
	};
}

const mountSupportWidgetMock = mock(() => createMockWidget());

mock.module("../mount-support-widget", () => ({
	mountSupportWidget: mountSupportWidgetMock,
}));

const widgetRuntimeModulePromise = import("./widget-runtime");

describe("installCossistantBrowserRuntime", () => {
	beforeEach(() => {
		mountSupportWidgetMock.mockClear();

		Object.defineProperty(globalThis, "window", {
			value: {
				Cossistant: {
					__assets: {
						cssUrl: "https://cdn.cossistant.com/widget/latest/widget.css",
						widgetUrl: "https://cdn.cossistant.com/widget/latest/widget.js",
					},
					__queue: [
						{
							args: [
								{
									publicKey: "pk_test_browser",
									theme: {
										mode: "dark",
									},
								},
							],
							method: "init",
						},
					],
				},
			},
			configurable: true,
		});

		Object.defineProperty(globalThis, "document", {
			value: {
				currentScript: null,
			},
			configurable: true,
		});
	});

	it("replays queued init calls and exposes the real singleton api", async () => {
		const { installCossistantBrowserRuntime } =
			await widgetRuntimeModulePromise;

		const api = installCossistantBrowserRuntime();

		expect(api).toBe(window.Cossistant);
		expect(mountSupportWidgetMock).toHaveBeenCalledTimes(1);
		expect(mountSupportWidgetMock.mock.calls[0]?.[0]).toMatchObject({
			provider: {
				publicKey: "pk_test_browser",
			},
			style: {
				stylesheetUrl: "https://cdn.cossistant.com/widget/latest/widget.css",
				useShadowDom: true,
			},
			theme: {
				mode: "dark",
			},
		});
	});

	it("queues config updates until init and proxies updates afterwards", async () => {
		(window as typeof window & { Cossistant: any }).Cossistant.__queue = [];

		const { installCossistantBrowserRuntime } =
			await widgetRuntimeModulePromise;
		const api = installCossistantBrowserRuntime();

		api.updateConfig({
			quickOptions: ["Pricing"],
		});
		api.init();

		const widget = mountSupportWidgetMock.mock.results.at(-1)?.value;
		expect(widget.updateConfig).not.toHaveBeenCalled();

		api.updateConfig({
			quickOptions: ["Support"],
		});

		expect(widget.updateConfig).toHaveBeenCalledWith({
			quickOptions: ["Support"],
		});
	});

	it("reuses the installed global runtime without remounting twice", async () => {
		const { installCossistantBrowserRuntime } =
			await widgetRuntimeModulePromise;

		const firstApi = installCossistantBrowserRuntime();
		const secondApi = installCossistantBrowserRuntime();

		expect(firstApi).toBe(secondApi);
		expect(mountSupportWidgetMock).toHaveBeenCalledTimes(1);
	});

	it("auto-inits from loader data-attribute config before replaying queued calls", async () => {
		(window as typeof window & { Cossistant?: unknown }).Cossistant = {
			__queue: [
				{
					args: [],
					method: "show",
				},
			],
		};
		(
			window as typeof window & {
				__COSSISTANT_BROWSER_WIDGET_LOADER__?: unknown;
			}
		).__COSSISTANT_BROWSER_WIDGET_LOADER__ = {
			assets: {
				cssUrl: "https://cdn.cossistant.com/widget/latest/widget.css",
				widgetUrl: "https://cdn.cossistant.com/widget/latest/widget.js",
			},
			autoInit: {
				apiUrl: "https://api.example.com",
				publicKey: "pk_data_attr",
			},
			isLoading: true,
		};

		const { installCossistantBrowserRuntime } =
			await widgetRuntimeModulePromise;

		installCossistantBrowserRuntime();

		expect(mountSupportWidgetMock).toHaveBeenCalledTimes(1);
		expect(mountSupportWidgetMock.mock.calls[0]?.[0]).toMatchObject({
			provider: {
				apiUrl: "https://api.example.com",
				publicKey: "pk_data_attr",
			},
		});

		const widget = mountSupportWidgetMock.mock.results.at(-1)?.value;
		expect(widget.show).toHaveBeenCalledTimes(1);
	});

	it("continues replaying the queue when a queued call throws before init", async () => {
		(window as typeof window & { Cossistant: any }).Cossistant.__queue = [
			{
				args: [],
				method: "show",
			},
			{
				args: [{ publicKey: "pk_test_browser" }],
				method: "init",
			},
		];

		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		try {
			const { installCossistantBrowserRuntime } =
				await widgetRuntimeModulePromise;

			installCossistantBrowserRuntime();

			expect(mountSupportWidgetMock).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy.mock.calls[0]?.[0]).toContain("show");
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("honors pre-init updateConfig({ open: true }) when the widget mounts", async () => {
		(window as typeof window & { Cossistant: any }).Cossistant.__queue = [];

		const { installCossistantBrowserRuntime } =
			await widgetRuntimeModulePromise;
		const api = installCossistantBrowserRuntime();

		api.updateConfig({ open: true });
		api.init({ publicKey: "pk_test_browser" });

		expect(mountSupportWidgetMock).toHaveBeenCalledTimes(1);
		expect(mountSupportWidgetMock.mock.calls[0]?.[0]).toMatchObject({
			provider: {
				defaultOpen: true,
				publicKey: "pk_test_browser",
			},
		});
	});

	it("defers queue replay until DOMContentLoaded when executed in <head>", async () => {
		const listeners: Array<() => void> = [];

		Object.defineProperty(globalThis, "document", {
			value: {
				addEventListener: mock((_type: string, listener: () => void) => {
					listeners.push(listener);
				}),
				body: undefined,
				currentScript: null,
				readyState: "loading",
			},
			configurable: true,
		});

		const { installCossistantBrowserRuntime } =
			await widgetRuntimeModulePromise;

		installCossistantBrowserRuntime();

		expect(mountSupportWidgetMock).not.toHaveBeenCalled();
		expect(listeners).toHaveLength(1);

		listeners[0]?.();

		expect(mountSupportWidgetMock).toHaveBeenCalledTimes(1);
	});
});
