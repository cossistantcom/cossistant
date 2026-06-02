import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { Index } from "./__index__";
import { resolveRegistrySourceDescriptor } from "./source";

describe("resolveRegistrySourceDescriptor", () => {
	it("falls back to the runtime path when no separate source is provided", () => {
		expect(
			resolveRegistrySourceDescriptor({
				path: "src/components/example.tsx",
			})
		).toEqual({
			type: "file",
			path: "src/components/example.tsx",
		});
	});

	it("prefers sourcePath over the runtime path when present", () => {
		expect(
			resolveRegistrySourceDescriptor({
				path: "src/components/runtime.tsx",
				sourcePath: "src/components/example.tsx",
			})
		).toEqual({
			type: "file",
			path: "src/components/example.tsx",
		});
	});

	it("prefers inline code over file-based sources", () => {
		expect(
			resolveRegistrySourceDescriptor({
				code: "export default function Example() { return null; }",
				path: "src/components/runtime.tsx",
				sourcePath: "src/components/example.tsx",
			})
		).toEqual({
			type: "inline",
			code: "export default function Example() { return null; }",
		});
	});

	it("registers user feedback examples with clean source files", async () => {
		for (const name of ["user-feedback-emoji", "user-feedback-stars"]) {
			const item = Index[name];

			expect(item).toBeDefined();
			if (!item) {
				throw new Error(`Missing registry item ${name}`);
			}

			expect(item?.sourcePath).toStartWith(
				"src/components/user-feedback/examples/"
			);
			expect(item?.path).toStartWith("src/components/user-feedback/demo-");

			const source = resolveRegistrySourceDescriptor(item);
			expect(source.type).toBe("file");

			if (source.type === "file") {
				const candidates = [
					path.join(process.cwd(), source.path),
					path.join(process.cwd(), "apps/web", source.path),
				];
				const exists = await Promise.any(
					candidates.map(async (candidate) => {
						await access(candidate);
						return true;
					})
				).catch(() => false);

				expect(exists).toBe(true);
			}
		}
	});

	it("exposes the web registry from the repository root", () => {
		const rootRegistry = JSON.parse(
			readFileSync(
				path.resolve(import.meta.dir, "../../../..", "registry.json"),
				"utf8"
			)
		) as { include?: string[] };

		expect(rootRegistry.include).toEqual(["apps/web/registry.json"]);
	});

	it("registers Next.js and React support items for GitHub registry installs", async () => {
		const appRegistry = JSON.parse(
			readFileSync(path.resolve(import.meta.dir, "../../registry.json"), "utf8")
		) as {
			items?: Array<{
				dependencies?: string[];
				envVars?: Record<string, string>;
				files?: Array<{ path: string; target?: string }>;
				name?: string;
			}>;
		};

		const support = appRegistry.items?.find((item) => item.name === "support");
		const supportReact = appRegistry.items?.find(
			(item) => item.name === "support-react"
		);

		expect(support?.dependencies).toContain("@cossistant/next");
		expect(support?.envVars).toHaveProperty("NEXT_PUBLIC_COSSISTANT_API_KEY");
		expect(supportReact?.dependencies).toContain("@cossistant/react");
		expect(supportReact?.envVars).toHaveProperty("VITE_COSSISTANT_API_KEY");

		for (const item of [support, supportReact]) {
			expect(item?.files).toHaveLength(3);

			for (const file of item?.files ?? []) {
				expect(file.target).toStartWith("@components/cossistant/");
				await access(path.resolve(import.meta.dir, "../..", file.path));
			}
		}
	});
});
