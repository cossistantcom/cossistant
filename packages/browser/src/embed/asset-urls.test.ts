import { describe, expect, it } from "bun:test";
import {
	resolveBrowserEmbedAssetUrls,
	resolveBrowserEmbedAssetUrlsFromDocument,
} from "./asset-urls";

describe("browser embed asset urls", () => {
	it("resolves widget assets next to the loader url", () => {
		expect(
			resolveBrowserEmbedAssetUrls(
				"https://cdn.cossistant.com/widget/0.1.2/loader.js"
			)
		).toEqual({
			baseUrl: "https://cdn.cossistant.com/widget/0.1.2/",
			cssUrl: "https://cdn.cossistant.com/widget/0.1.2/widget.css",
			loaderUrl: "https://cdn.cossistant.com/widget/0.1.2/loader.js",
			widgetUrl: "https://cdn.cossistant.com/widget/0.1.2/widget.js",
		});
	});

	it("reads asset urls from document.currentScript", () => {
		expect(
			resolveBrowserEmbedAssetUrlsFromDocument({
				currentScript: {
					src: "https://cdn.cossistant.com/widget/latest/loader.js",
				} as HTMLScriptElement,
			})
		).toEqual({
			baseUrl: "https://cdn.cossistant.com/widget/latest/",
			cssUrl: "https://cdn.cossistant.com/widget/latest/widget.css",
			loaderUrl: "https://cdn.cossistant.com/widget/latest/loader.js",
			widgetUrl: "https://cdn.cossistant.com/widget/latest/widget.js",
		});
	});
});
