import { describe, expect, it } from "bun:test";
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
});
