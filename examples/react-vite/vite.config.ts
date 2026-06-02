import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const nodeModulesDir = path.join(rootDir, "node_modules");

export default defineConfig({
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: [
			{ find: "react", replacement: path.join(nodeModulesDir, "react") },
			{
				find: "react-dom",
				replacement: path.join(nodeModulesDir, "react-dom"),
			},
		],
	},
	server: {
		host: "127.0.0.1",
		port: 3346,
		strictPort: true,
	},
	preview: {
		host: "127.0.0.1",
		port: 3346,
		strictPort: true,
	},
});
