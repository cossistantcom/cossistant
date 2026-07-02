export type BrowserEmbedAutoInitOptions = {
	apiUrl?: string;
	publicKey: string;
	wsUrl?: string;
};

type ScriptWithDataset = {
	dataset?: {
		apiUrl?: string;
		publicKey?: string;
		wsUrl?: string;
	};
};

export function resolveBrowserEmbedAutoInitOptionsFromDocument(
	doc: Pick<Document, "currentScript">
): BrowserEmbedAutoInitOptions | null {
	const script = doc.currentScript as ScriptWithDataset | null;
	const dataset = script?.dataset;

	if (!dataset?.publicKey) {
		return null;
	}

	const options: BrowserEmbedAutoInitOptions = {
		publicKey: dataset.publicKey,
	};

	if (dataset.apiUrl) {
		options.apiUrl = dataset.apiUrl;
	}

	if (dataset.wsUrl) {
		options.wsUrl = dataset.wsUrl;
	}

	return options;
}
