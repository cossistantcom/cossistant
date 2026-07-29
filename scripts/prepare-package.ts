/** biome-ignore-all lint/performance/useTopLevelRegex: ok */
/** biome-ignore-all lint/performance/noDelete: ok */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

const stripSrcPrefix = (value: string) => value.replace(/^\.\/src\//, "./");

const withExtension = (value: string, extension: string) => {
	if (value.endsWith("/*")) {
		return `${value}.${extension}`;
	}
	if (value.includes("*")) {
		return value
			.replace(/\*\.tsx?$/, `*.${extension}`)
			.replace(/\*$/, `*.${extension}`);
	}
	if (/\.tsx?$/.test(value)) {
		if (extension === "d.ts") {
			return value.replace(/\.tsx?$/, ".d.ts");
		}
		return value.replace(/\.tsx?$/, `.${extension}`);
	}
	return value;
};

/**
 * Converts workspace:* dependencies to actual semver versions
 */
const resolveWorkspaceDependencies = async (
	dependencies: Record<string, string> | undefined,
	packageDir: string
): Promise<Record<string, string> | undefined> => {
	if (!dependencies) {
		return;
	}

	const resolved: Record<string, string> = {};

	for (const [name, version] of Object.entries(dependencies)) {
		if (version === "workspace:*" || version.startsWith("workspace:")) {
			// Try to resolve the workspace package version
			const packageName = name.replace("@cossistant/", "");
			const workspacePkgPath = path.join(
				packageDir,
				"..",
				packageName,
				"package.json"
			);

			try {
				const workspacePkg = JSON.parse(
					await readFile(workspacePkgPath, "utf8")
				);
				resolved[name] = workspacePkg.version;
			} catch {
				// If we can't read the package, keep the workspace protocol
				// This happens for devDependencies like @cossistant/typescript-config
				resolved[name] = version;
			}
		} else {
			resolved[name] = version;
		}
	}

	return resolved;
};

const toDistExport = (value: unknown) => {
	if (typeof value !== "string") {
		return value;
	}
	const normalized = stripSrcPrefix(value);
	// Data files are published as-is; mapping them to {types,import} would point
	// at .d.ts/.js files that do not exist.
	if (normalized.endsWith(".json")) {
		return normalized;
	}
	if (normalized.endsWith(".css")) {
		// CSS files should strip ./dist/ prefix since the package.json is in dist/
		if (normalized.startsWith("./dist/")) {
			return normalized.replace(/^\.\/dist\//, "./");
		}
		// CSS files built to dist root should map support/support.css -> support.css
		if (normalized === "./support/support.css") {
			return "./support.css";
		}
		return normalized;
	}
	return {
		types: withExtension(normalized, "d.ts"),
		import: withExtension(normalized, "js"),
	};
};

const main = async () => {
	const packageDir = path.resolve(process.argv[2] ?? ".");
	const pkgPath = path.join(packageDir, "package.json");
	const raw = await readFile(pkgPath, "utf8");
	const pkg = JSON.parse(raw);

	const distDir = path.join(packageDir, "dist");
	await mkdir(distDir, { recursive: true });

	const distExports = Object.fromEntries(
		Object.entries(pkg.exports ?? {}).map(([key, value]) => [
			key,
			toDistExport(value),
		])
	);

	const publishConfig = { ...(pkg.publishConfig ?? {}) };
	delete publishConfig.directory;

	// Resolve workspace:* dependencies to actual versions
	const resolvedDependencies = await resolveWorkspaceDependencies(
		pkg.dependencies,
		packageDir
	);
	const resolvedPeerDependencies = await resolveWorkspaceDependencies(
		pkg.peerDependencies,
		packageDir
	);

	const { scripts, devDependencies, files, ...rest } = pkg;
	const distPkg = {
		...rest,
		main: "./index.js",
		module: "./index.js",
		types: "./index.d.ts",
		exports: distExports,
		dependencies: resolvedDependencies,
		peerDependencies: resolvedPeerDependencies,
		publishConfig: Object.keys(publishConfig).length
			? publishConfig
			: undefined,
	} as Record<string, unknown>;

	if (distPkg.publishConfig === undefined) {
		delete distPkg.publishConfig;
	}

	delete distPkg.files;
	delete distPkg.scripts;
	delete distPkg.devDependencies;

	const distPkgPath = path.join(distDir, "package.json");
	await writeFile(distPkgPath, `${JSON.stringify(distPkg, null, 2)}\n`, "utf8");

	for (const fileName of ["README.md", "LICENSE", "openapi.json"]) {
		const source = path.join(packageDir, fileName);
		try {
			await copyFile(source, path.join(distDir, fileName));
		} catch {
			// optional
		}
	}

	console.log(
		`[prepare-package] wrote ${path.relative(process.cwd(), distPkgPath)}`
	);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
