import { describe, expect, it } from "bun:test";
import {
	getSupportInstallCommand,
	getSupportInstallCommands,
} from "./support-integration-guide";

describe("support integration install commands", () => {
	it("returns unpinned Next.js commands for all package managers", () => {
		expect(getSupportInstallCommands("nextjs")).toEqual({
			bun: "bun add @plasma/next",
			npm: "npm install @plasma/next",
			pnpm: "pnpm add @plasma/next",
			yarn: "yarn add @plasma/next",
		});
	});

	it("returns unpinned React commands for all package managers", () => {
		expect(getSupportInstallCommands("react")).toEqual({
			bun: "bun add @plasma/react",
			npm: "npm install @plasma/react",
			pnpm: "pnpm add @plasma/react",
			yarn: "yarn add @plasma/react",
		});
	});

	it("returns version-pinned Next.js commands for all package managers", () => {
		expect(getSupportInstallCommands("nextjs", "0.0.28")).toEqual({
			bun: "bun add @plasma/next@0.0.28",
			npm: "npm install @plasma/next@0.0.28",
			pnpm: "pnpm add @plasma/next@0.0.28",
			yarn: "yarn add @plasma/next@0.0.28",
		});
	});

	it("returns version-pinned React commands for all package managers", () => {
		expect(getSupportInstallCommands("react", "0.0.28")).toEqual({
			bun: "bun add @plasma/react@0.0.28",
			npm: "npm install @plasma/react@0.0.28",
			pnpm: "pnpm add @plasma/react@0.0.28",
			yarn: "yarn add @plasma/react@0.0.28",
		});
	});

	it("returns a single version-pinned command for the requested package manager", () => {
		expect(
			getSupportInstallCommand({
				installationTarget: "react",
				packageManager: "npm",
				version: "0.1.2",
			})
		).toBe("npm install @plasma/react@0.1.2");
	});
});
