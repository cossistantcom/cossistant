import { execa } from "execa";

export type Commit = {
	hash: string;
	subject: string;
	author: string;
	date: string;
};

export async function getLastReleaseTag(): Promise<string | null> {
	try {
		const { stdout } = await execa("git", [
			"tag",
			"--list",
			"@plasma/react@*",
			"--sort=-v:refname",
		]);
		const tags = stdout.trim().split("\n").filter(Boolean);
		return tags[0] || null;
	} catch {
		return null;
	}
}

export async function getCommitsSinceLastRelease(
	lastTag: string | null
): Promise<Commit[]> {
	const range = lastTag ? `${lastTag}..HEAD` : "HEAD~50..HEAD";

	const { stdout } = await execa("git", [
		"log",
		range,
		"--pretty=format:%h|%s|%an|%ad",
		"--date=short",
	]);

	return stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const parts = line.split("|");
			return {
				hash: parts[0] ?? "",
				subject: parts[1] ?? "",
				author: parts[2] ?? "",
				date: parts[3] ?? "",
			};
		});
}

export async function getCurrentBranch(): Promise<string> {
	const { stdout } = await execa("git", ["branch", "--show-current"]);
	return stdout.trim();
}

export async function hasUncommittedChanges(): Promise<boolean> {
	const { stdout } = await execa("git", ["status", "--porcelain"]);
	return stdout.trim().length > 0;
}
