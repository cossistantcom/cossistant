import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/**/*.ts",
		"src/**/*.tsx",
		"!src/**/*.test.ts",
		"!src/**/*.test.tsx",
		"!src/**/*.stories.tsx",
		"!src/**/*.css",
	],
	clean: true,
	dts: true,
	hash: false,
	minify: true,
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
		"react/jsx-runtime",
		"@plasma/core",
		"@plasma/types",
		"@plasma/tiny-markdown",
		"facehash",
		"@floating-ui/react",
		"class-variance-authority",
		"clsx",
		"nanoid",
		"tailwind-merge",
		"ulid",
	],
});
