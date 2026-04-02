import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { SubmitOpenSourceProgramApplicationRequest } from "@plasma/types";

const getWebsiteByIdWithAccessMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const postSlackWebhookMessageMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);

mock.module("@api/db/queries/website", () => ({
	getWebsiteByIdWithAccess: getWebsiteByIdWithAccessMock,
}));

mock.module("@api/utils/slack-webhook", () => ({
	postSlackWebhookMessage: postSlackWebhookMessageMock,
}));

const modulePromise = Promise.all([
	import("../init"),
	import("./open-source-program"),
]);

function createWebsite() {
	return {
		id: "01JG0000000000000000000000",
		name: "Facehash",
		domain: "facehash.dev",
		organizationId: "01JG000000000000000000001",
	} as const;
}

function createInput(
	overrides: Partial<SubmitOpenSourceProgramApplicationRequest> = {}
): SubmitOpenSourceProgramApplicationRequest {
	return {
		websiteId: "01JG0000000000000000000000",
		repositoryUrl: "https://github.com/acme/oss-project",
		qualificationReasons: ["github-stars"],
		githubStars: 256,
		realUsersOrTrafficProof: undefined,
		saasProductProof: undefined,
		isMonetized: false,
		monthlyRecurringRevenueUsd: undefined,
		notes: "We would love help shipping the widget.",
		acknowledgePublicRepo: true,
		acknowledgeRecentCommits: true,
		acknowledgeWidgetMention: true,
		acknowledgeReadmeBadge: true,
		...overrides,
	};
}

async function createCaller() {
	const [{ createCallerFactory }, { openSourceProgramRouter }] =
		await modulePromise;
	const createCallerFactoryForRouter = createCallerFactory(
		openSourceProgramRouter
	);

	return createCallerFactoryForRouter({
		db: {} as never,
		user: {
			id: "user_1",
			name: "Anthony",
			email: "anthony@example.com",
		} as never,
		session: { id: "session_1" } as never,
		geo: {} as never,
		headers: new Headers(),
	});
}

describe("openSourceProgram router", () => {
	beforeEach(() => {
		getWebsiteByIdWithAccessMock.mockReset();
		postSlackWebhookMessageMock.mockReset();

		getWebsiteByIdWithAccessMock.mockResolvedValue(createWebsite());
		postSlackWebhookMessageMock.mockResolvedValue(undefined);
	});

	it("rejects inaccessible websites", async () => {
		getWebsiteByIdWithAccessMock.mockResolvedValueOnce(null);
		const caller = await createCaller();

		await expect(caller.submitApplication(createInput())).rejects.toMatchObject(
			{
				code: "FORBIDDEN",
				message: "You do not have access to this website.",
			}
		);
		expect(postSlackWebhookMessageMock).not.toHaveBeenCalled();
	});

	it("rejects invalid repository URLs before touching the database", async () => {
		const caller = await createCaller();

		await expect(
			caller.submitApplication(
				createInput({
					repositoryUrl: "https://gitlab.com/acme/oss-project",
				})
			)
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(getWebsiteByIdWithAccessMock).not.toHaveBeenCalled();
	});

	it("sends the formatted Slack payload with applicant and website context", async () => {
		const caller = await createCaller();

		await caller.submitApplication(
			createInput({
				qualificationReasons: ["github-stars", "real-users", "saas-product"],
				githubStars: 512,
				realUsersOrTrafficProof: "Serving 15k weekly docs readers.",
				saasProductProof: "Powers our hosted support dashboard.",
				isMonetized: true,
				monthlyRecurringRevenueUsd: 4200,
				notes: "We already embedded the widget in docs and app.",
			})
		);

		expect(postSlackWebhookMessageMock).toHaveBeenCalledTimes(1);

		const payload = postSlackWebhookMessageMock.mock.calls[0]?.[0] as
			| {
					text: string;
					blocks: unknown[];
			  }
			| undefined;
		const serializedBlocks = JSON.stringify(payload?.blocks ?? []);

		expect(payload?.text).toContain("anthony@example.com");
		expect(serializedBlocks).toContain("Anthony");
		expect(serializedBlocks).toContain("facehash.dev");
		expect(serializedBlocks).toContain("https://github.com/acme/oss-project");
		expect(serializedBlocks).toContain("GitHub stars: 512");
		expect(serializedBlocks).toContain("Serving 15k weekly docs readers.");
		expect(serializedBlocks).toContain("Powers our hosted support dashboard.");
		expect(serializedBlocks).toContain("$4,200 MRR");
		expect(serializedBlocks).toContain(
			"We already embedded the widget in docs and app."
		);
		expect(serializedBlocks).toContain("Add README badge: yes");
	});

	it("includes monetized projects without shared MRR in the Slack payload", async () => {
		const caller = await createCaller();

		await caller.submitApplication(
			createInput({
				isMonetized: true,
				monthlyRecurringRevenueUsd: undefined,
			})
		);

		const payload = postSlackWebhookMessageMock.mock.calls[0]?.[0] as
			| {
					blocks: unknown[];
			  }
			| undefined;
		const serializedBlocks = JSON.stringify(payload?.blocks ?? []);

		expect(serializedBlocks).toContain("Monetized (MRR not shared)");
	});
});
