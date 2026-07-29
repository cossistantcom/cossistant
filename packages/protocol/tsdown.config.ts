import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/**/*.ts", "!src/**/*.test.ts"],
	clean: true,
	dts: {
		// Resolve and bundle all type dependencies to avoid exposing zod's .d.cts files
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
	// Keep schema/route dependencies external so builds reference their package
	// specifiers instead of Bun's internal store paths that break in npm installs
	external: [
		"@cossistant/types",
		"@hono/zod-openapi",
		"hono",
		"openapi3-ts",
		"zod",
	],
});
