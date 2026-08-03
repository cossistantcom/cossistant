import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

type AssetName = "loader.js" | "widget.js" | "widget.css";

type AssetThreshold = {
	raw: number;
	gzip: number;
};

const BASELINES: Record<AssetName, AssetThreshold> = {
	"loader.js": { raw: 1170, gzip: 637 },
	"widget.js": { raw: 398_674, gzip: 126_958 },
	"widget.css": { raw: 16_468, gzip: 2238 },
};

const WIDGET_GZIP_ABSOLUTE_CEILING = 140_000;

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const embedDir = join(repoRoot, "packages/browser/dist/embed");

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDelta(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}

	const sign = bytes > 0 ? "+" : "";
	return `${sign}${formatBytes(bytes)}`;
}

const warnings: string[] = [];
const errors: string[] = [];

console.log("Browser embed asset sizes");

for (const assetName of Object.keys(BASELINES) as AssetName[]) {
	const assetPath = join(embedDir, assetName);

	if (!existsSync(assetPath)) {
		errors.push(`Missing embed asset: ${assetName}`);
		continue;
	}

	const source = readFileSync(assetPath);
	const rawBytes = source.byteLength;
	const gzipBytes = gzipSync(source).byteLength;
	const baseline = BASELINES[assetName];
	const rawDelta = rawBytes - baseline.raw;
	const gzipDelta = gzipBytes - baseline.gzip;

	console.log(
		`- ${assetName}: raw ${formatBytes(rawBytes)} (${formatDelta(rawDelta)}), gzip ${formatBytes(gzipBytes)} (${formatDelta(gzipDelta)})`
	);

	if (assetName === "widget.js") {
		if (gzipBytes > WIDGET_GZIP_ABSOLUTE_CEILING) {
			errors.push(
				`widget.js gzip is ${formatBytes(gzipBytes)}, above the absolute ${WIDGET_GZIP_ABSOLUTE_CEILING.toLocaleString("en-US")}-byte (${formatBytes(WIDGET_GZIP_ABSOLUTE_CEILING)}) ceiling`
			);
		}

		if (gzipDelta > 0) {
			errors.push(
				`widget.js gzip regressed by ${formatBytes(gzipDelta)} over the ${formatBytes(baseline.gzip)} baseline`
			);
		}

		if (rawDelta > 0) {
			warnings.push(
				`widget.js raw size grew by ${formatBytes(rawDelta)} over the ${formatBytes(baseline.raw)} baseline`
			);
		}

		if (gzipBytes <= WIDGET_GZIP_ABSOLUTE_CEILING) {
			console.log(
				`widget.js is within the absolute ${WIDGET_GZIP_ABSOLUTE_CEILING.toLocaleString("en-US")}-byte (${formatBytes(WIDGET_GZIP_ABSOLUTE_CEILING)}) gzip ceiling`
			);
		}

		continue;
	}

	if (gzipDelta > 0 || rawDelta > 0) {
		warnings.push(
			`${assetName} regressed (raw ${formatDelta(rawDelta)}, gzip ${formatDelta(gzipDelta)})`
		);
	}
}

for (const warning of warnings) {
	console.warn(`warning: ${warning}`);
}

if (errors.length > 0) {
	for (const error of errors) {
		console.error(`error: ${error}`);
	}

	process.exit(1);
}
