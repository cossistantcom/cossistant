import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";

const isOrganizationAdminOrOwnerMock = mock(
	(async () => true) as (...args: unknown[]) => Promise<boolean>
);

mock.module("@api/utils/access-control", () => ({
	isOrganizationAdminOrOwner: isOrganizationAdminOrOwnerMock,
}));

const modulePromise = import("./organization-settings");

const ORGANIZATION_ID = "01ARYZ6S41TSV4RRFFQ69G5FAV";
const USER_ID = "01ARYZ6S41TSV4RRFFQ69G5FAW";

function createUpdateDb(returningRows: unknown[]) {
	const returningMock = mock(async () => returningRows);
	const whereMock = mock(() => ({ returning: returningMock }));
	const setMock = mock(() => ({ where: whereMock }));
	const updateMock = mock(() => ({ set: setMock }));

	return {
		db: {
			update: updateMock,
		} as unknown as Database,
		returningMock,
		setMock,
		updateMock,
		whereMock,
	};
}

describe("organization settings queries", () => {
	beforeEach(() => {
		isOrganizationAdminOrOwnerMock.mockReset();
		isOrganizationAdminOrOwnerMock.mockResolvedValue(true);
	});

	it("rejects invalid timezones before updating", async () => {
		const { updateOrganizationSettings } = await modulePromise;
		const { db, updateMock } = createUpdateDb([]);

		await expect(
			updateOrganizationSettings(db, {
				organizationId: ORGANIZATION_ID,
				userId: USER_ID,
				timezone: "Paris",
				weeklyDigestEnabled: true,
			})
		).rejects.toThrow("Invalid timezone");
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("returns null when the user is not an owner or admin", async () => {
		const { updateOrganizationSettings } = await modulePromise;
		const { db, updateMock } = createUpdateDb([]);
		isOrganizationAdminOrOwnerMock.mockResolvedValue(false);

		const result = await updateOrganizationSettings(db, {
			organizationId: ORGANIZATION_ID,
			userId: USER_ID,
			timezone: "Europe/Paris",
			weeklyDigestEnabled: false,
		});

		expect(result).toBeNull();
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("updates timezone and weekly digest preference for owners and admins", async () => {
		const { updateOrganizationSettings } = await modulePromise;
		const row = {
			id: ORGANIZATION_ID,
			name: "Acme",
			slug: "acme",
			timezone: "Europe/Paris",
			weeklyDigestEnabled: false,
		};
		const { db, setMock } = createUpdateDb([row]);

		const result = await updateOrganizationSettings(db, {
			organizationId: ORGANIZATION_ID,
			userId: USER_ID,
			timezone: " Europe/Paris ",
			weeklyDigestEnabled: false,
		});

		expect(result).toEqual(row);
		const setCall = setMock.mock.calls[0] as unknown[] | undefined;
		expect(setCall?.[0]).toEqual({
			timezone: "Europe/Paris",
			weeklyDigestEnabled: false,
		});
	});
});
