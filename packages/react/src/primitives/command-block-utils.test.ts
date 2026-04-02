import { describe, expect, it } from "bun:test";
import { mapCommandVariants } from "./command-block-utils";

describe("mapCommandVariants", () => {
	it("maps npm install commands to all package managers", () => {
		const variants = mapCommandVariants("npm install @plasma/react");

		expect(variants).toEqual({
			npm: "npm install @plasma/react",
			yarn: "yarn add @plasma/react",
			pnpm: "pnpm add @plasma/react",
			bun: "bun add @plasma/react",
		});
	});

	it("maps pnpm add commands to all package managers", () => {
		const variants = mapCommandVariants("pnpm add @plasma/react");

		expect(variants).toEqual({
			npm: "npm install @plasma/react",
			yarn: "yarn add @plasma/react",
			pnpm: "pnpm add @plasma/react",
			bun: "bun add @plasma/react",
		});
	});

	it("maps yarn and bun install variants to all package managers", () => {
		expect(mapCommandVariants("yarn add zod")).toEqual({
			npm: "npm install zod",
			yarn: "yarn add zod",
			pnpm: "pnpm add zod",
			bun: "bun add zod",
		});

		expect(mapCommandVariants("bun add zod")).toEqual({
			npm: "npm install zod",
			yarn: "yarn add zod",
			pnpm: "pnpm add zod",
			bun: "bun add zod",
		});
	});

	it("maps run script commands across package managers", () => {
		expect(mapCommandVariants("npm run dev")).toEqual({
			npm: "npm run dev",
			yarn: "yarn dev",
			pnpm: "pnpm dev",
			bun: "bun dev",
		});

		expect(mapCommandVariants("pnpm run build")).toEqual({
			npm: "npm run build",
			yarn: "yarn build",
			pnpm: "pnpm build",
			bun: "bun build",
		});

		expect(mapCommandVariants("yarn lint")).toEqual({
			npm: "npm run lint",
			yarn: "yarn lint",
			pnpm: "pnpm lint",
			bun: "bun lint",
		});
	});

	it("maps create commands across package managers", () => {
		expect(mapCommandVariants("npm create next-app@latest my-app")).toEqual({
			npm: "npm create next-app@latest my-app",
			yarn: "yarn create next-app@latest my-app",
			pnpm: "pnpm create next-app@latest my-app",
			bun: "bun create next-app@latest my-app",
		});

		expect(mapCommandVariants("pnpm create next-app@latest my-app")).toEqual({
			npm: "npm create next-app@latest my-app",
			yarn: "yarn create next-app@latest my-app",
			pnpm: "pnpm create next-app@latest my-app",
			bun: "bun create next-app@latest my-app",
		});
	});

	it("maps npx and dlx style commands across package managers", () => {
		expect(mapCommandVariants("npx create-next-app@latest my-app")).toEqual({
			npm: "npx create-next-app@latest my-app",
			yarn: "yarn create next-app@latest my-app",
			pnpm: "pnpm create next-app@latest my-app",
			bun: "bunx --bun create-next-app@latest my-app",
		});

		expect(mapCommandVariants("npx drizzle-kit push")).toEqual({
			npm: "npx drizzle-kit push",
			yarn: "yarn drizzle-kit push",
			pnpm: "pnpm dlx drizzle-kit push",
			bun: "bunx --bun drizzle-kit push",
		});

		expect(mapCommandVariants("pnpm dlx drizzle-kit push")).toEqual({
			npm: "npx drizzle-kit push",
			yarn: "yarn drizzle-kit push",
			pnpm: "pnpm dlx drizzle-kit push",
			bun: "bunx --bun drizzle-kit push",
		});
	});

	it("returns null for unsupported or ambiguous commands", () => {
		expect(mapCommandVariants("echo hello")).toBeNull();
		expect(mapCommandVariants("npm install")).toBeNull();
		expect(mapCommandVariants("yarn")).toBeNull();
		expect(mapCommandVariants("pnpm --help")).toBeNull();
	});
});
