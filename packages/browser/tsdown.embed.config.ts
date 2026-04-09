import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const require = createRequire(import.meta.url);
const resolveLocalModule = (relativePath: string) =>
	fileURLToPath(new URL(relativePath, import.meta.url));

const sharedConfig = {
	outDir: "dist/embed",
	platform: "browser" as const,
	format: "iife" as const,
	dts: false,
	hash: false,
	minify: true,
	sourcemap: false,
	treeshake: true,
	unbundle: false,
	outExtensions: () => ({
		js: ".js",
	}),
	report: false,
	target: "es2020",
	external: [],
	noExternal: [/.*/],
	define: {
		"import.meta": "{}",
	},
	alias: {
		"@cossistant/core": resolveLocalModule("../core/dist/index.js"),
		"@cossistant/core/client": resolveLocalModule("../core/dist/client.js"),
		"@cossistant/core/human-agent-display": resolveLocalModule(
			"../core/dist/human-agent-display.js"
		),
		"@cossistant/core/locale-utils": resolveLocalModule(
			"../core/dist/locale-utils.js"
		),
		"@cossistant/core/realtime-client": resolveLocalModule(
			"../core/dist/realtime-client.js"
		),
		"@cossistant/core/realtime-event-filter": resolveLocalModule(
			"../core/dist/realtime-event-filter.js"
		),
		"@cossistant/core/resolve-public-key": resolveLocalModule(
			"../core/dist/resolve-public-key.js"
		),
		"@cossistant/core/store/conversations-store": resolveLocalModule(
			"../core/dist/store/conversations-store.js"
		),
		"@cossistant/core/store/processing-store": resolveLocalModule(
			"../core/dist/store/processing-store.js"
		),
		"@cossistant/core/store/seen-store": resolveLocalModule(
			"../core/dist/store/seen-store.js"
		),
		"@cossistant/core/store/support-store": resolveLocalModule(
			"../core/dist/store/support-store.js"
		),
		"@cossistant/core/store/typing-store": resolveLocalModule(
			"../core/dist/store/typing-store.js"
		),
		"@cossistant/core/store/website-store": resolveLocalModule(
			"../core/dist/store/website-store.js"
		),
		"@cossistant/core/support-controller": resolveLocalModule(
			"../core/dist/support-controller.js"
		),
		"@cossistant/core/types": resolveLocalModule("../core/dist/types.js"),
		"@cossistant/core/upload-constants": resolveLocalModule(
			"../core/dist/upload-constants.js"
		),
		"@cossistant/core/utils": resolveLocalModule("../core/dist/utils.js"),
		"@cossistant/react": resolveLocalModule("../react/dist/index.js"),
		"@cossistant/react/provider": resolveLocalModule(
			"../react/dist/provider.js"
		),
		"@cossistant/react/support": resolveLocalModule(
			"../react/dist/support/index.js"
		),
		"@cossistant/types/enums": resolveLocalModule("../types/dist/enums.js"),
		"@cossistant/types/tool-timeline-policy": resolveLocalModule(
			"../types/dist/tool-timeline-policy.js"
		),
		react: require.resolve("preact/compat"),
		"react-dom": require.resolve("preact/compat"),
		"react-dom/client": require.resolve("preact/compat/client"),
		"react/jsx-runtime": require.resolve("preact/jsx-runtime"),
	},
	inputOptions: {
		onwarn(
			warning: { code?: string },
			forwardWarning: (nextWarning: unknown) => void
		) {
			if (warning.code === "EVAL") {
				return;
			}

			forwardWarning(warning);
		},
	},
};

export default [
	defineConfig({
		...sharedConfig,
		entry: {
			loader: "src/embed/loader.ts",
		},
		name: "CossistantBrowserLoader",
		clean: true,
	}),
	defineConfig({
		...sharedConfig,
		entry: {
			widget: "src/embed/widget.ts",
		},
		name: "CossistantBrowserWidget",
		clean: false,
	}),
];
