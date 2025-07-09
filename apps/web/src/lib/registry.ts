/** biome-ignore-all lint/nursery/noAwaitInLoop: <explanation> */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	type registryItemFileSchema,
	registryItemSchema,
} from "shadcn/registry";

import { Project, ScriptKind } from "ts-morph";
import type { z } from "zod";

import { Index } from "@/registry/__index__";

export function getRegistryComponent(name: string) {
	return Index[name]?.component;
}

export async function getRegistryItem(name: string) {
	const item = Index[name];

	if (!item) {
		return null;
	}

	// Convert all file paths to object.
	// TODO: remove when we migrate to new registry.
	item.files = item.files.map((file: unknown) =>
		typeof file === "string" ? { path: file } : file
	) as z.infer<typeof registryItemSchema>["files"];

	// Fail early before doing expensive file operations.
	const result = registryItemSchema.safeParse(item);
	if (!result.success) {
		return null;
	}

	let files: typeof result.data.files = [];
	for (const file of item.files) {
		const content = await getFileContent(file);
		const relativePath = path.relative(process.cwd(), file.path);

		files.push({
			...file,
			path: relativePath,
			content,
		});
	}

	// Fix file paths.
	files = fixFilePaths(files);

	const parsed = registryItemSchema.safeParse({
		...result.data,
		files,
	});

	if (!parsed.success) {
		console.error(parsed.error.message);
		return null;
	}

	return parsed.data;
}

async function getFileContent(file: z.infer<typeof registryItemFileSchema>) {
	const raw = await fs.readFile(file.path, "utf-8");

	const project = new Project({
		compilerOptions: {},
	});

	const tempFile = await createTempSourceFile(file.path);
	const sourceFile = project.createSourceFile(tempFile, raw, {
		scriptKind: ScriptKind.TSX,
	});

	// Remove meta variables.
	// removeVariable(sourceFile, "iframeHeight")
	// removeVariable(sourceFile, "containerClassName")
	// removeVariable(sourceFile, "description")

	let code = sourceFile.getFullText();

	// Some registry items uses default export.
	// We want to use named export instead.
	// TODO: do we really need this? - @shadcn.
	if (file.type !== "registry:page") {
		code = code.replaceAll("export default", "export");
	}

	// Fix imports.
	code = fixImport(code);

	return code;
}

function getFileTarget(file: z.infer<typeof registryItemFileSchema>) {
	let target = file.target;

	if (!target || target === "") {
		const fileName = file.path.split("/").pop();
		if (
			file.type === "registry:block" ||
			file.type === "registry:component" ||
			file.type === "registry:example"
		) {
			target = `components/${fileName}`;
		}

		if (file.type === "registry:ui") {
			target = `components/ui/${fileName}`;
		}

		if (file.type === "registry:hook") {
			target = `hooks/${fileName}`;
		}

		if (file.type === "registry:lib") {
			target = `lib/${fileName}`;
		}
	}

	return target ?? "";
}

async function createTempSourceFile(filename: string) {
	const dir = await fs.mkdtemp(path.join(tmpdir(), "shadcn-"));
	return path.join(dir, filename);
}

function fixFilePaths(files: z.infer<typeof registryItemSchema>["files"]) {
	if (!files) {
		return [];
	}

	// Resolve all paths relative to the first file's directory.
	const firstFilePath = files[0].path;
	const firstFilePathDir = path.dirname(firstFilePath);

	return files.map((file) => {
		return {
			...file,
			path: path.relative(firstFilePathDir, file.path),
			target: getFileTarget(file),
		};
	});
}

export function fixImport(content: string) {
	const regex = /@\/(.+?)\/((?:.*?\/)?(?:components|ui|hooks|lib))\/([\w-]+)/g;

	const replacement = (
		match: string,
		_path: string,
		type: string,
		component: string
	) => {
		if (type.endsWith("components")) {
			return `@/components/${component}`;
		}
		if (type.endsWith("ui")) {
			return `@/components/ui/${component}`;
		}
		if (type.endsWith("hooks")) {
			return `@/hooks/${component}`;
		}
		if (type.endsWith("lib")) {
			return `@/lib/${component}`;
		}

		return match;
	};

	return content.replace(regex, replacement);
}
