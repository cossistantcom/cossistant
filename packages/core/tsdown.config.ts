import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/**/*.ts", "!src/**/*.test.ts"],
	clean: true,
	dts: {
		// Resolve and bundle all type dependencies to avoid exposing third-party .d.cts files
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
	// Keep utility libraries and transitive dependencies external
	// zod and @hono/zod-openapi are needed because @cossistant/types uses them
	external: ["@cossistant/types", "nanoid", "ulid", "zod", "@hono/zod-openapi"],
});
