import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/feedback/index.tsx",
		"src/hooks/index.ts",
		"src/identify-visitor.tsx",
		"src/internal/hooks.ts",
		"src/lazy-support.tsx",
		"src/primitives/index.ts",
		"src/provider.tsx",
		"src/realtime/index.ts",
		"src/support/index.tsx",
		"src/support-config.tsx",
		"src/utils/index.ts",
	],
	clean: true,
	dts: {
		// Resolve workspace type dependencies so published declarations keep
		// package specifiers instead of vendoring sibling source trees.
		resolve: true,
	},
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
		"@cossistant/core",
		"@cossistant/types",
		"@cossistant/tiny-markdown",
		"facehash",
		"@floating-ui/react",
		"class-variance-authority",
		"clsx",
		"nanoid",
		"tailwind-merge",
	],
});
