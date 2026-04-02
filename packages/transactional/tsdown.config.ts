import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/**/*.{ts,tsx}"],
	platform: "browser",
	sourcemap: true,
	minify: false,
	treeshake: true,
	dts: true,
	// external: [
	//   // React ecosystem (peer dependencies)
	//   "react",
	//   "react-dom",
	//   "react/jsx-runtime",

	//   // Peer dependencies
	//   "@tanstack/react-query",
	//   "motion",
	//   "motion/*",
	//   "tailwindcss",

	//   // Internal workspace packages that should be bundled
	//   // Remove "@plasma/*" to bundle core and types
	//   "@plasma/core",
	//   "@plasma/types",

	//   // Regular dependencies that should stay external
	//   "react-use-websocket",
	//   "react-markdown",
	//   "zustand",
	//   "zustand/middleware",
	//   "nanoid",
	//   "ulid",
	//   "tailwind-merge",
	// ],
});
