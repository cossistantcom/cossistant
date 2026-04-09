import { beforeEach, describe, expect, it, mock } from "bun:test";

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
});
