import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const createTinybirdLocalJwtMock = mock(
	async (_websiteId: string) => "local-jwt"
);
const readTinybirdLocalStatusMock = mock(async () => null);
const jsonwebtokenSignMock = mock(() => "cloud-jwt");

describe("tinybird jwt generation", () => {
	beforeEach(() => {
		createTinybirdLocalJwtMock.mockClear();
		readTinybirdLocalStatusMock.mockClear();
		jsonwebtokenSignMock.mockClear();
	});

	afterEach(() => {
		mock.restore();
	});

	it("uses Tinybird CLI to mint JWTs for local hosts", async () => {
		mock.module("@api/env", () => ({
			env: {
				TINYBIRD_HOST: "http://localhost:7181",
				TINYBIRD_SIGNING_KEY: "unused-signing-key",
				TINYBIRD_TOKEN: "unused-token",
				TINYBIRD_WORKSPACE: "workspace-local",
			},
		}));
			mock.module("@api/lib/tinybird-local-cli", () => ({
				createTinybirdLocalJwt: createTinybirdLocalJwtMock,
				readTinybirdLocalStatus: readTinybirdLocalStatusMock,
			}));
		mock.module("jsonwebtoken", () => ({
			default: {
				sign: jsonwebtokenSignMock,
			},
		}));

		const module = await import(`./tinybird-jwt.ts?local=${Math.random()}`);
		const token = await module.generateTinybirdJWT("site-1");

		expect(token).toBe("local-jwt");
		expect(createTinybirdLocalJwtMock).toHaveBeenCalledWith("site-1", [
			"online_now",
			"visitor_presence",
			"presence_locations",
			"inbox_analytics",
			"unique_visitors",
		]);
		expect(jsonwebtokenSignMock).not.toHaveBeenCalled();
	});

	it("self-signs JWTs for non-local Tinybird hosts", async () => {
		mock.module("@api/env", () => ({
			env: {
				TINYBIRD_HOST: "https://api.us-east.aws.tinybird.co",
				TINYBIRD_SIGNING_KEY: "cloud-signing-key",
				TINYBIRD_TOKEN: "cloud-token",
				TINYBIRD_WORKSPACE: "workspace-cloud",
			},
		}));
			mock.module("@api/lib/tinybird-local-cli", () => ({
				createTinybirdLocalJwt: createTinybirdLocalJwtMock,
				readTinybirdLocalStatus: readTinybirdLocalStatusMock,
			}));
		mock.module("jsonwebtoken", () => ({
			default: {
				sign: jsonwebtokenSignMock,
			},
		}));

		const module = await import(`./tinybird-jwt.ts?cloud=${Math.random()}`);
		const token = await module.generateTinybirdJWT("site-1");

		expect(token).toBe("cloud-jwt");
		expect(jsonwebtokenSignMock).toHaveBeenCalledTimes(1);
		expect(createTinybirdLocalJwtMock).not.toHaveBeenCalled();
	});
});
