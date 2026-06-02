import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL: "http://127.0.0.1:3346",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun run dev",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		url: "http://127.0.0.1:3346",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
