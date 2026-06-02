import { beforeEach, describe, expect, it, mock } from "bun:test";
import { contact } from "@api/db/schema";

const getWebsiteBySlugWithAccessMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/db/queries/website", () => ({
	getWebsiteBySlugWithAccess: getWebsiteBySlugWithAccessMock,
}));

const modulePromise = Promise.all([import("../init"), import("./contact")]);

const website = {
	id: "site-1",
	organizationId: "org-1",
};
const contactId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function createDb(returningResults: unknown[][]) {
	let updateIndex = 0;
	const returningMock = mock((async (_fields?: unknown) => {
		const result = returningResults[updateIndex] ?? [];
		updateIndex += 1;
		return result;
	}) as (_fields?: unknown) => Promise<unknown[]>);
	const updateWhereMock = mock((() => ({
		returning: returningMock,
	})) as (_where: unknown) => {
		returning: (_fields?: unknown) => Promise<unknown[]>;
	});
	const updateSetMock = mock((() => ({
		where: updateWhereMock,
	})) as (_set: unknown) => {
		where: (_where: unknown) => {
			returning: (_fields?: unknown) => Promise<unknown[]>;
		};
	});
	const updateMock = mock((() => ({
		set: updateSetMock,
	})) as (_table: unknown) => {
		set: (_set: unknown) => {
			where: (_where: unknown) => {
				returning: (_fields?: unknown) => Promise<unknown[]>;
			};
		};
	});

	return {
		db: {
			update: updateMock,
		},
		returningMock,
		updateMock,
		updateSetMock,
		updateWhereMock,
	};
}

async function createCaller(db: unknown) {
	const [{ createCallerFactory }, { contactRouter }] = await modulePromise;
	const createCallerFactoryForRouter = createCallerFactory(contactRouter);

	return createCallerFactoryForRouter({
		db: db as never,
		user: {
			id: "user-1",
			name: "User One",
			email: "user@example.com",
		} as never,
		session: { id: "session-1" } as never,
		geo: {} as never,
		headers: new Headers(),
	});
}

describe("contact router deletion mutations", () => {
	beforeEach(() => {
		getWebsiteBySlugWithAccessMock.mockReset();

		getWebsiteBySlugWithAccessMock.mockResolvedValue(website);
	});

	it("soft deletes a single contact through the dashboard router", async () => {
		const harness = createDb([[{ id: contactId }]]);
		const caller = await createCaller(harness.db);

		const result = await caller.delete({
			websiteSlug: "acme",
			contactId,
		});

		expect(result).toEqual({ id: contactId });
		expect(getWebsiteBySlugWithAccessMock).toHaveBeenCalledWith(harness.db, {
			userId: "user-1",
			websiteSlug: "acme",
		});
		expect(harness.updateMock).toHaveBeenCalledWith(contact);
		expect(harness.updateSetMock).toHaveBeenCalledTimes(1);
		expect(harness.updateWhereMock).toHaveBeenCalledTimes(1);
		expect(harness.returningMock).toHaveBeenCalledTimes(1);
	});

	it("rejects single contact deletion when the contact is not found", async () => {
		const harness = createDb([[]]);
		const caller = await createCaller(harness.db);

		await expect(
			caller.delete({
				websiteSlug: "acme",
				contactId,
			})
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Contact not found",
		});
	});

	it("rejects bulk deletion when website access fails", async () => {
		getWebsiteBySlugWithAccessMock.mockResolvedValueOnce(null);
		const harness = createDb([]);
		const caller = await createCaller(harness.db);

		await expect(
			caller.deleteAll({ websiteSlug: "acme" })
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Website not found or access denied",
		});
		expect(harness.updateMock).not.toHaveBeenCalled();
	});

	it("soft deletes all contacts scoped to the website and organization", async () => {
		const harness = createDb([
			[{ id: "contact-1" }, { id: "contact-2" }, { id: "contact-3" }],
		]);
		const caller = await createCaller(harness.db);

		const result = await caller.deleteAll({ websiteSlug: "acme" });

		expect(result).toEqual({ deletedCount: 3 });
		expect(harness.updateMock).toHaveBeenCalledWith(contact);
		expect(harness.updateSetMock).toHaveBeenCalledTimes(1);
		expect(harness.updateWhereMock).toHaveBeenCalledTimes(1);
		expect(harness.returningMock).toHaveBeenCalledWith({ id: contact.id });
	});
});
