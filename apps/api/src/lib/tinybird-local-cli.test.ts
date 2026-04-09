import { describe, expect, it, mock } from "bun:test";

describe("tinybird local cli helpers", () => {
	it("parses tb local status output", async () => {
		const { parseTinybirdLocalStatusOutput } = await import(
			`./tinybird-local-cli.ts?status=${Math.random()}`
		);
		const status = parseTinybirdLocalStatusOutput(`
» Tinybird Local:
--------------------------------------------------------------------------------
workspace_id: 6c024f43-c414-4a51-86ac-ec9d3e77d5a7
token: tb.local.token
--------------------------------------------------------------------------------
`);

		expect(status).toEqual({
			workspaceId: "6c024f43-c414-4a51-86ac-ec9d3e77d5a7",
			token: "tb.local.token",
		});
	});

	it("parses tb token create jwt output", async () => {
		const { parseTinybirdJwtOutput } = await import(
			`./tinybird-local-cli.ts?jwt=${Math.random()}`
		);
		expect(
			parseTinybirdJwtOutput(`
Running against Tinybird Local
The token has been generated successfully.
The token is: header.payload.signature
`)
		).toBe("header.payload.signature");
	});

	it("reads Tinybird Local status via tb local status", async () => {
		const { readTinybirdLocalStatus } = await import(
			`./tinybird-local-cli.ts?read=${Math.random()}`
		);
		const execFileMock = mock(
			async (_command: string, _args: string[], _options: { cwd: string }) => ({
				stdout: "workspace_id: workspace-live\ntoken: tb.live.token\n",
				stderr: "",
			})
		);

		const status = await readTinybirdLocalStatus(execFileMock);

		expect(status).toEqual({
			workspaceId: "workspace-live",
			token: "tb.live.token",
		});
		expect(execFileMock.mock.calls[0]).toEqual([
			"tb",
			["local", "status"],
			expect.objectContaining({
				cwd: expect.stringContaining("/tinybird"),
			}),
		]);
	});

	it("creates a multi-scope local jwt via tb token create jwt", async () => {
		const { createTinybirdLocalJwt } = await import(
			`./tinybird-local-cli.ts?create=${Math.random()}`
		);
		const execFileMock = mock(
			async (_command: string, _args: string[], _options: { cwd: string }) => ({
				stdout:
					"Running against Tinybird Local\nThe token has been generated successfully.\nThe token is: header.payload.signature\n",
				stderr: "",
			})
		);

		const token = await createTinybirdLocalJwt(
			"site-1",
			["online_now", "visitor_presence"],
			execFileMock
		);

		expect(token).toBe("header.payload.signature");
		expect(execFileMock.mock.calls[0]).toEqual([
			"tb",
			[
				"token",
				"create",
				"jwt",
				"frontend_site-1",
				"--ttl",
				"10m",
				"--scope",
				"PIPES:READ",
				"--resource",
				"online_now",
				"--fixed-params",
				"website_id=site-1",
				"--scope",
				"PIPES:READ",
				"--resource",
				"visitor_presence",
				"--fixed-params",
				"website_id=site-1",
			],
			expect.objectContaining({
				cwd: expect.stringContaining("/tinybird"),
			}),
		]);
	});
});
