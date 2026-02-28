import { execSync } from "node:child_process";

const TAG_REGEX = /^(.*)@([^@]+)$/;

const getArg = () => {
	const [, , tag] = process.argv;
	if (!tag) {
		throw new Error("Tag argument is required");
	}
	return tag;
};

const parseTag = (tag) => {
	const match = tag.match(TAG_REGEX);
	if (!match) {
		throw new Error(`Unable to parse tag: ${tag}`);
	}
	const [, packageName, version] = match;
	return { packageName, version };
};

const getTagsForPackage = (packageName) => {
	const raw = execSync(
		`git tag --list '${packageName}@*' --sort=-v:refname`
	).toString();
	return raw
		.split("\n")
		.map((item) => item.trim())
		.filter(Boolean);
};

const getCommitsBetween = (startRef, endRef) => {
	const separator = "\u241E"; // record separator symbol
	const cmd = startRef
		? `git log ${startRef}..${endRef} --first-parent --pretty=format:%h${separator}%s`
		: `git log ${endRef} --max-count=50 --first-parent --pretty=format:%h${separator}%s`;

	const output = execSync(cmd).toString().trim();
	if (!output) {
		return [];
	}
	return output.split("\n").map((line) => {
		const [sha, subject] = line.split(separator);
		return { sha: sha.trim(), subject: subject.trim() };
	});
};

const determinePreviousTag = (tags, currentTag) => {
	const index = tags.indexOf(currentTag);
	if (index === -1) {
		throw new Error(`Tag ${currentTag} not found in tag list`);
	}
	return tags[index + 1];
};

const formatCommits = (commits) => {
	if (commits.length === 0) {
		return "- No code changes since the previous release.";
	}
	return commits
		.map((commit) => `- ${commit.subject} (${commit.sha})`)
		.join("\n");
};

const main = async () => {
	const tag = getArg();
	const { packageName, version } = parseTag(tag);
	const tags = getTagsForPackage(packageName);
	const previousTag = determinePreviousTag(tags, tag);

	const isInitialRelease = !previousTag;
	const commits = previousTag ? getCommitsBetween(previousTag, tag) : [];

	const body = [
		`## ${packageName}@${version}`,
		"",
		"### What's Changed",
		isInitialRelease ? "- Initial release." : formatCommits(commits),
		"",
		"### Install",
		`\`bun add ${packageName}@${version}\``,
		`\`npm install ${packageName}@${version}\``,
	].join("\n");

	// console.log(body);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
