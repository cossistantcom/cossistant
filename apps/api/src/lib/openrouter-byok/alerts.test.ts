import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";
import {
	buildOpenRouterByokAlertKey,
	maybeSendOpenRouterByokProblemAlert,
	type OpenRouterByokAlertDeps,
} from "./alerts";

const ORGANIZATION_ID = "org_1";
const WEBSITE_ID = "site_1";
const CHECKED_AT = "2026-05-15T12:00:00.000Z";
const originalConsoleWarn = console.warn;
const consoleWarnMock = mock(() => {});

function createRedisMock() {
	const keys = new Set<string>();
	const set = mock(
		async (key: string, value: string, ...args: Array<string | number>) => {
			if (keys.has(key)) {
				return null;
			}

			keys.add(key);
			return "OK";
		}
	);

	return { redis: { set }, set };
}

function createDeps(overrides: Partial<OpenRouterByokAlertDeps> = {}) {
	const { redis, set } = createRedisMock();
	const sendBatchEmail = mock(async () => ({ data: null, error: null }));
	const getAlertConfig = mock(async () => ({
		enabled: true,
		maskedKey: "sk-or-v1...abcdef",
		website: {
			id: WEBSITE_ID,
			name: "Docs",
			slug: "docs",
			domain: "docs.example.com",
		},
	}));
	const getOwnerRecipients = mock(async () => [
		{
			memberId: "member_1",
			userId: "user_1",
			name: "Owner",
			email: "owner@example.com",
		},
	]);
	const isEmailSuppressed = mock(async () => false);

	return {
		deps: {
			redis,
			sendBatchEmail,
			getAlertConfig,
			getOwnerRecipients,
			isEmailSuppressed,
			now: () => new Date(CHECKED_AT),
			appUrl: "https://app.example.com",
			...overrides,
		},
		set,
		sendBatchEmail,
		getAlertConfig,
		getOwnerRecipients,
		isEmailSuppressed,
	};
}

function createContext() {
	return {
		db: {} as Database,
		organizationId: ORGANIZATION_ID,
		websiteId: WEBSITE_ID,
	};
}

describe("maybeSendOpenRouterByokProblemAlert", () => {
	beforeEach(() => {
		mock.restore();
		console.warn = consoleWarnMock as typeof console.warn;
		consoleWarnMock.mockReset();
	});

	afterAll(() => {
		console.warn = originalConsoleWarn;
	});

	it("sends the first failure alert and throttles the same website and recipient", async () => {
		const { deps, set, sendBatchEmail } = createDeps();

		const firstResult = await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "APICallError",
			checkedAt: CHECKED_AT,
			deps,
		});
		const secondResult = await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "APICallError",
			checkedAt: CHECKED_AT,
			deps,
		});

		expect(firstResult).toEqual({ status: "sent", recipientCount: 1 });
		expect(secondResult).toEqual({ status: "throttled", recipientCount: 0 });
		expect(sendBatchEmail).toHaveBeenCalledTimes(1);
		expect(set).toHaveBeenCalledWith(
			buildOpenRouterByokAlertKey({
				websiteId: WEBSITE_ID,
				recipientEmail: "owner@example.com",
			}),
			CHECKED_AT,
			"EX",
			86_400,
			"NX"
		);
	});

	it("throttles different error codes for the same website and recipient", async () => {
		const { deps, sendBatchEmail } = createDeps();

		await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "APICallError",
			deps,
		});
		await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "RateLimitError",
			deps,
		});

		expect(sendBatchEmail).toHaveBeenCalledTimes(1);
	});

	it("allows separate daily alerts for different websites", async () => {
		const { deps, sendBatchEmail } = createDeps();

		await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "APICallError",
			deps,
		});
		await maybeSendOpenRouterByokProblemAlert({
			context: { ...createContext(), websiteId: "site_2" },
			errorCode: "APICallError",
			deps: {
				...deps,
				getAlertConfig: mock(async () => ({
					enabled: true,
					maskedKey: "sk-or-v1...abcdef",
					website: {
						id: "site_2",
						name: "Docs 2",
						slug: "docs-2",
						domain: "docs-2.example.com",
					},
				})),
			},
		});

		expect(sendBatchEmail).toHaveBeenCalledTimes(2);
	});

	it("skips email when Redis throttling fails", async () => {
		const set = mock(async () => {
			throw new Error("redis unavailable");
		});
		const { deps, sendBatchEmail } = createDeps({ redis: { set } });

		const result = await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "APICallError",
			deps,
		});

		expect(result).toEqual({ status: "redis_failed", recipientCount: 0 });
		expect(consoleWarnMock).toHaveBeenCalledTimes(1);
		expect(sendBatchEmail).not.toHaveBeenCalled();
	});

	it("does not send when the saved key is no longer enabled", async () => {
		const { deps, set, sendBatchEmail } = createDeps({
			getAlertConfig: mock(async () => ({
				enabled: false,
				maskedKey: "sk-or-v1...abcdef",
				website: {
					id: WEBSITE_ID,
					name: "Docs",
					slug: "docs",
					domain: "docs.example.com",
				},
			})),
		});

		const result = await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "APICallError",
			deps,
		});

		expect(result).toEqual({ status: "no_enabled_key", recipientCount: 0 });
		expect(set).not.toHaveBeenCalled();
		expect(sendBatchEmail).not.toHaveBeenCalled();
	});

	it("never receives or sends plaintext key material", async () => {
		const plaintextKey = "sk-or-v1-secret-value-that-must-not-leak";
		const { deps, sendBatchEmail } = createDeps();

		await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "APICallError",
			deps,
		});

		const emailPayload = JSON.stringify(sendBatchEmail.mock.calls);
		expect(emailPayload).toContain("sk-or-v1...abcdef");
		expect(emailPayload).not.toContain(plaintextKey);
		expect(emailPayload).not.toContain("secret-value-that-must-not-leak");
	});

	it("filters suppressed owner recipients before sending", async () => {
		const { deps, sendBatchEmail } = createDeps({
			getOwnerRecipients: mock(async () => [
				{
					memberId: "member_1",
					userId: "user_1",
					name: "Suppressed Owner",
					email: "suppressed@example.com",
				},
				{
					memberId: "member_2",
					userId: "user_2",
					name: "Deliverable Owner",
					email: "deliverable@example.com",
				},
			]),
			isEmailSuppressed: mock(
				async (_db, params) => params.email === "suppressed@example.com"
			),
		});

		const result = await maybeSendOpenRouterByokProblemAlert({
			context: createContext(),
			errorCode: "APICallError",
			deps,
		});

		expect(result).toEqual({ status: "sent", recipientCount: 1 });
		const [emails] = sendBatchEmail.mock.calls[0] as unknown as [
			Array<{ to: string }>,
		];
		expect(emails.map((email) => email.to)).toEqual([
			"deliverable@example.com",
		]);
	});
});
