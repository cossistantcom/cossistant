#!/usr/bin/env bun
import path from "node:path";
import { config } from "@dotenvx/dotenvx";

// Load .env from the release package directory
config({ path: path.join(import.meta.dir, "../.env"), quiet: true });

import { Command } from "commander";
import kleur from "kleur";
import prompts from "prompts";
import { releaseChangelogOnly } from "./release-changelog-only";
import { releaseCossistant as releasePlasma } from "./release-cossistant";
import { releaseFacehash } from "./release-facehash";

const program = new Command()
	.name("cossistant-release")
	.description("Release CLI for Cossistant packages")
	.version("0.0.1");

program
	.command("create")
	.description("Create a new release")
	.action(async () => {
		console.log(kleur.cyan().bold("\n  Cossistant Release CLI\n"));

		// Step 1: Select which package(s) to release
		const { target } = await prompts({
			type: "select",
			name: "target",
			message: "What would you like to release?",
			choices: [
				{
					title: "Facehash",
					description: "Avatar library (simple release)",
					value: "facehash",
				},
				{
					title: "Cossistant Suite",
					description: "Core packages (AI-powered changelog)",
					value: "cossistant",
				},
				{
					title: "Changelog Only",
					description: "Changelog entry without package publish",
					value: "changelog-only",
				},
			],
		});

		if (!target) {
			process.exit(0);
		}

		if (target === "facehash") {
			await releaseFacehash();
		} else if (target === "changelog-only") {
			await releaseChangelogOnly();
		} else {
			await releasePlasma();
		}
	});

program.parse();
