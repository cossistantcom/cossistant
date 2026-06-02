import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL: "http://localhost:3345",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun run dev",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		url: "http://localhost:3345",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
