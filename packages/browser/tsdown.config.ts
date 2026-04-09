import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/**/*.ts",
		"!src/**/*.test.ts",
		"!src/embed/**/*.ts",
	],
	clean: true,
	dts: {
		resolve: true,
	},
	hash: false,
	minify: false,
	sourcemap: true,
	treeshake: true,
	unbundle: true,
	outExtensions: () => ({
		js: ".js",
		dts: ".d.ts",
	}),
	external: [
		"react",
		"react-dom",
		"react-dom/client",
		"react/jsx-runtime",
		"@cossistant/core",
		"@cossistant/react",
	],
});
