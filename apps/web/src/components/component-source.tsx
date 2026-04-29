import fs from "node:fs/promises";
import path from "node:path";
import type * as React from "react";
import { highlightCode } from "@/lib/highlight-code";
import { cn } from "@/lib/utils";
import { Index } from "@/registry/__index__";
import { resolveRegistrySourceDescriptor } from "@/registry/source";
import { ComponentCode } from "./component-code";

export async function ComponentSource({
	name,
	className,
}: React.ComponentProps<"div"> & {
	name: string;
}) {
	const item = Index[name];

	if (!item) {
		return null;
	}

	const source = resolveRegistrySourceDescriptor(item);
	const registrySourcePath =
		source.type === "file" && source.path.startsWith("src/")
			? source.path.slice("src/".length)
			: source.type === "file"
				? source.path
				: "";
	const code =
		source.type === "inline"
			? source.code
			: await fs.readFile(
					path.join(process.cwd(), "src", registrySourcePath),
					"utf-8"
				);
	const highlightedCode = await highlightCode(code, "tsx");

	return (
		<div className={cn("relative my-auto", className)}>
			<ComponentCode code={code} highlightedCode={highlightedCode} />
		</div>
	);
}
