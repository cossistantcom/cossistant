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
		// Resolved workspace declarations are rewritten back to package
		// specifiers by scripts/rewrite-dist-types.ts, and the vendored
		// dist/packages tree is removed before publishing.
		resolve: true,
	},
	hash: false,
	minify: false,
	sourcemap: false,
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
		"@cossistant/types",
	],
});
