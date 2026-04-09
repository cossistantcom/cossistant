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
	"loader.js": { raw: 1171, gzip: 638 },
	"widget.js": { raw: 380_025, gzip: 122_183 },
	"widget.css": { raw: 13_229, gzip: 2104 },
};

const WIDGET_GZIP_STOP_TARGET = 140_000;
const WIDGET_GZIP_PASS_TWO_THRESHOLD = 150_000;

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

		if (gzipBytes <= WIDGET_GZIP_STOP_TARGET) {
			console.log(
				`widget.js hit the pass 1 stop target at ${formatBytes(gzipBytes)} gzip`
			);
		} else if (gzipBytes > WIDGET_GZIP_PASS_TWO_THRESHOLD) {
			warnings.push(
				`widget.js is still above ${formatBytes(WIDGET_GZIP_PASS_TWO_THRESHOLD)} gzip, so pass 2 lazy-loading work is recommended next`
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
