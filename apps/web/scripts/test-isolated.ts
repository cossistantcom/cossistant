/**
 * Runs each test file in its own `bun test` process.
 *
 * bun registers `mock.module()` factories globally for the whole test process
 * and they are never unwound. Nearly every component test here mocks a module
 * partially (say `@tanstack/react-query` with only `useMutation`), so in a
 * single combined run the first partial factory wins and every later file that
 * imports a missing export dies with
 * "SyntaxError: Export named 'useX' not found in module ...".
 *
 * That is not a defect in the tests — each file is self-consistent and passes
 * on its own. Isolating per file is the same remedy CI already applies to
 * apps/api's OpenAPI contract test, just applied to the whole suite.
 *
 * Usage:
 *   bun scripts/test-isolated.ts            # every test file
 *   bun scripts/test-isolated.ts src/lib    # only files under a path
 */
import { Glob } from "bun";

const args = process.argv.slice(2);
const filters = args.filter((arg) => !arg.startsWith("-"));

const glob = new Glob("src/**/*.test.{ts,tsx}");
const allFiles = (await Array.fromAsync(glob.scan("."))).sort();

const files = filters.length
	? allFiles.filter((file) => filters.some((filter) => file.startsWith(filter)))
	: allFiles;

if (files.length === 0) {
	console.error(
		filters.length
			? `No test files matched: ${filters.join(", ")}`
			: "No test files found."
	);
	process.exit(1);
}

const concurrency = Math.max(
	1,
	Math.min(8, (navigator.hardwareConcurrency ?? 4) - 1)
);

type Result = {
	file: string;
	ok: boolean;
	pass: number;
	fail: number;
	output: string;
};

// bun prints the per-file tallies as " N pass" / " N fail".
function countFrom(output: string, label: "pass" | "fail"): number {
	let total = 0;
	for (const line of output.split("\n")) {
		const match = line.match(new RegExp(`^\\s*(\\d+)\\s+${label}\\s*$`));
		if (match) {
			total += Number(match[1]);
		}
	}
	return total;
}

async function runFile(file: string): Promise<Result> {
	const proc = Bun.spawn(["bun", "test", file], {
		env: { ...process.env, NODE_ENV: "test" },
		stderr: "pipe",
		stdout: "pipe",
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	const output = stdout + stderr;

	return {
		fail: countFrom(output, "fail"),
		file,
		ok: exitCode === 0,
		output,
		pass: countFrom(output, "pass"),
	};
}

const queue = [...files];
const results: Result[] = [];

async function worker() {
	while (queue.length > 0) {
		const file = queue.shift();
		if (!file) {
			return;
		}
		const result = await runFile(file);
		results.push(result);
		process.stdout.write(result.ok ? "." : "x");
	}
}

const started = Bun.nanoseconds();
await Promise.all(
	Array.from({ length: Math.min(concurrency, files.length) }, () => worker())
);
const elapsedMs = (Bun.nanoseconds() - started) / 1_000_000;

process.stdout.write("\n");

const failures = results.filter((result) => !result.ok);
const totalPass = results.reduce((sum, result) => sum + result.pass, 0);
const totalFail = results.reduce((sum, result) => sum + result.fail, 0);

for (const failure of failures) {
	console.log(`\n${"─".repeat(72)}\nFAIL ${failure.file}\n`);
	console.log(failure.output.trimEnd());
}

console.log(
	`\n${files.length} files · ${totalPass} pass · ${totalFail} fail · ${failures.length} failing files · ${elapsedMs.toFixed(0)}ms`
);

process.exit(failures.length > 0 ? 1 : 0);
