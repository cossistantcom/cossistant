import { describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";
import { listWeeklyDigestCandidateWebsites } from "./lifecycle-email";

function createWeeklyCandidateDb(rows: unknown[]) {
	const offsetMock = mock(async (_offset: number) => rows);
	const limitMock = mock((_limit: number) => ({ offset: offsetMock }));
	const orderByMock = mock((..._args: unknown[]) => ({ limit: limitMock }));
	const whereMock = mock((_condition: unknown) => ({ orderBy: orderByMock }));
	const innerJoinMock = mock((..._args: unknown[]) => ({ where: whereMock }));
	const fromMock = mock((_table: unknown) => ({ innerJoin: innerJoinMock }));
	const selectMock = mock((_selection: unknown) => ({ from: fromMock }));

	return {
		db: {
			select: selectMock,
		} as unknown as Database,
		fromMock,
		innerJoinMock,
		limitMock,
		offsetMock,
		orderByMock,
		selectMock,
		whereMock,
	};
}

describe("lifecycle email queries", () => {
	it("lists website-scoped weekly digest candidates", async () => {
		const rows = [
			{
				organizationId: "org_1",
				organizationName: "Acme",
				timezone: "Europe/Paris",
				websiteId: "site_1",
				websiteName: "Acme Docs",
				websiteSlug: "acme-docs",
			},
		];
		const harness = createWeeklyCandidateDb(rows);

		const result = await listWeeklyDigestCandidateWebsites(harness.db, {
			limit: 50,
			offset: 100,
		});

		expect(result).toEqual(rows);
		expect(harness.selectMock).toHaveBeenCalledTimes(1);
		expect(Object.keys(harness.selectMock.mock.calls[0]?.[0] ?? {})).toEqual([
			"organizationId",
			"organizationName",
			"timezone",
			"websiteId",
			"websiteName",
			"websiteSlug",
		]);
		expect(harness.innerJoinMock).toHaveBeenCalledTimes(1);
		expect(harness.whereMock).toHaveBeenCalledTimes(1);
		expect(harness.orderByMock).toHaveBeenCalledTimes(1);
		expect(harness.limitMock).toHaveBeenCalledWith(50);
		expect(harness.offsetMock).toHaveBeenCalledWith(100);
	});
});
