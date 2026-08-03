import { describe, expect, it } from "bun:test";
import {
	getSupportInstallCommand,
	getSupportInstallCommands,
	getSupportIntegrationGuide,
	getSupportRegistryCommands,
	getSupportRegistryItem,
} from "./support-integration-guide";

describe("support integration install commands", () => {
	it("returns unpinned Next.js commands for all package managers", () => {
		expect(getSupportInstallCommands("nextjs")).toEqual({
			bun: "bun add @cossistant/next",
			npm: "npm install @cossistant/next",
			pnpm: "pnpm add @cossistant/next",
			yarn: "yarn add @cossistant/next",
		});
	});

	it("returns unpinned React commands for all package managers", () => {
		expect(getSupportInstallCommands("react")).toEqual({
			bun: "bun add @cossistant/react",
			npm: "npm install @cossistant/react",
			pnpm: "pnpm add @cossistant/react",
			yarn: "yarn add @cossistant/react",
		});
	});

	it("returns version-pinned Next.js commands for all package managers", () => {
		expect(getSupportInstallCommands("nextjs", "0.0.28")).toEqual({
			bun: "bun add @cossistant/next@0.0.28",
			npm: "npm install @cossistant/next@0.0.28",
			pnpm: "pnpm add @cossistant/next@0.0.28",
			yarn: "yarn add @cossistant/next@0.0.28",
		});
	});

	it("returns version-pinned React commands for all package managers", () => {
		expect(getSupportInstallCommands("react", "0.0.28")).toEqual({
			bun: "bun add @cossistant/react@0.0.28",
			npm: "npm install @cossistant/react@0.0.28",
			pnpm: "pnpm add @cossistant/react@0.0.28",
			yarn: "yarn add @cossistant/react@0.0.28",
		});
	});

	it("returns a single version-pinned command for the requested package manager", () => {
		expect(
			getSupportInstallCommand({
				installationTarget: "react",
				packageManager: "npm",
				version: "0.1.2",
			})
		).toBe("npm install @cossistant/react@0.1.2");
	});

	it("returns the Next.js support registry item by default", () => {
		expect(getSupportRegistryItem("nextjs")).toBe(
			"cossistantcom/cossistant/support"
		);
		expect(getSupportRegistryCommands("nextjs")).toEqual({
			bun: "bunx --bun shadcn@latest add cossistantcom/cossistant/support",
			npm: "npx shadcn@latest add cossistantcom/cossistant/support",
			pnpm: "pnpm dlx shadcn@latest add cossistantcom/cossistant/support",
			yarn: "yarn dlx shadcn@latest add cossistantcom/cossistant/support",
		});
	});

	it("returns the React support registry item explicitly", () => {
		expect(getSupportRegistryItem("react")).toBe(
			"cossistantcom/cossistant/support-react"
		);
		expect(getSupportRegistryCommands("react")).toEqual({
			bun: "bunx --bun shadcn@latest add cossistantcom/cossistant/support-react",
			npm: "npx shadcn@latest add cossistantcom/cossistant/support-react",
			pnpm: "pnpm dlx shadcn@latest add cossistantcom/cossistant/support-react",
			yarn: "yarn dlx shadcn@latest add cossistantcom/cossistant/support-react",
		});
	});

	it("uses focused runtime entries and lazy-loads the default widget", () => {
		for (const installationTarget of ["nextjs", "react"] as const) {
			const guide = getSupportIntegrationGuide(installationTarget);
			const codeSamples = [
				guide.providerCode,
				guide.widgetCode,
				guide.identifyVisitorCode,
				guide.defaultMessageCode,
				guide.cssPlainCode,
			];

			for (const code of codeSamples) {
				expect(code).not.toMatch(/from ["']@cossistant\/(?:next|react)["']/);
			}

			expect(guide.widgetCode).toContain(
				`from "${guide.packageName}/lazy-support"`
			);
			expect(guide.widgetCode).toContain("<Suspense fallback={null}>");
			expect(guide.widgetCode).toContain("<LazySupport />");
		}
	});
});
