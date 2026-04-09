export type BrowserEmbedAssetUrls = {
	baseUrl: string;
	cssUrl: string;
	loaderUrl: string;
	widgetUrl: string;
};

export function resolveBrowserEmbedAssetUrls(
	loaderUrl: string
): BrowserEmbedAssetUrls {
	const baseUrl = new URL(".", loaderUrl).href;

	return {
		baseUrl,
		cssUrl: new URL("widget.css", baseUrl).href,
		loaderUrl,
		widgetUrl: new URL("widget.js", baseUrl).href,
	};
}

export function resolveBrowserEmbedAssetUrlsFromDocument(
	doc: Pick<Document, "currentScript">
): BrowserEmbedAssetUrls | null {
	const script = doc.currentScript;

	if (
		!(script && "src" in script) ||
		typeof script.src !== "string" ||
		script.src.length === 0
	) {
		return null;
	}

	return resolveBrowserEmbedAssetUrls(script.src);
}
