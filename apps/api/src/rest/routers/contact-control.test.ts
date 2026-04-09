import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const safelyExtractRequestQueryMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);

const listContactsMock = mock((async () => ({
	items: [],
	page: 1,
	pageSize: 20,
	totalCount: 0,
})) as (...args: unknown[]) => Promise<unknown>);
const identifyContactMock = mock((async () => ({
	id: "contact-1",
	websiteId: "site-1",
	organizationId: "org-1",
	createdAt: "2026-04-07T10:00:00.000Z",
	updatedAt: "2026-04-07T10:00:00.000Z",
})) as (...args: unknown[]) => Promise<unknown>);
const linkVisitorToContactMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const findVisitorForWebsiteMock = mock((async () => ({
	id: "visitor-1",
	websiteId: "site-1",
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	safelyExtractRequestQuery: safelyExtractRequestQueryMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries/contact", () => ({
	createContact: mock(async () => null),
	createContactOrganization: mock(async () => null),
	deleteContact: mock(async () => null),
	deleteContactOrganization: mock(async () => null),
	findContactForWebsite: mock(async () => null),
	findContactOrganizationForWebsite: mock(async () => null),
	identifyContact: identifyContactMock,
	linkVisitorToContact: linkVisitorToContactMock,
	listContacts: listContactsMock,
	mergeContactMetadata: mock(async () => null),
	updateContact: mock(async () => null),
	updateContactOrganization: mock(async () => null),
	upsertContactByExternalId: mock(async () => ({
		status: "created",
		contact: {
			id: "contact-1",
			websiteId: "site-1",
			organizationId: "org-1",
			externalId: "crm_1",
			createdAt: "2026-04-07T10:00:00.000Z",
			updatedAt: "2026-04-07T10:00:00.000Z",
		},
	})),
}));

mock.module("@api/db/queries/visitor", () => ({
	findVisitorForWebsite: findVisitorForWebsiteMock,
	getCompleteVisitorWithContact: mock(async () => null),
	getVisitor: mock(async () => null),
}));

mock.module("@api/utils/format-visitor", () => ({
	formatContactResponse: (record: unknown) => record,
	formatVisitorWithContactResponse: (record: unknown) => record,
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: mock(async () => {}),
	},
}));

mock.module("../middleware", () => ({
	protectedPrivateApiKeyMiddleware: [],
	protectedPublicApiKeyMiddleware: [],
}));

const contactRouterModulePromise = import("./contact");

describe("contact control routes", () => {
	const contactId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		safelyExtractRequestQueryMock.mockReset();
		validateResponseMock.mockReset();
		listContactsMock.mockReset();
		identifyContactMock.mockReset();
		linkVisitorToContactMock.mockReset();
		findVisitorForWebsiteMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		listContactsMock.mockResolvedValue({
			items: [
				{
					id: contactId,
					name: "Alice",
					email: "alice@example.com",
					image: null,
					createdAt: "2026-04-07T10:00:00.000Z",
					updatedAt: "2026-04-07T10:00:00.000Z",
					visitorCount: 2,
					lastSeenAt: "2026-04-07T11:00:00.000Z",
					contactOrganizationId: null,
					contactOrganizationName: null,
				},
			],
			page: 2,
			pageSize: 10,
			totalCount: 1,
		});
		identifyContactMock.mockResolvedValue({
			id: "contact-1",
			externalId: "crm_1",
			websiteId: "site-1",
			organizationId: "org-1",
			createdAt: "2026-04-07T10:00:00.000Z",
			updatedAt: "2026-04-07T10:00:00.000Z",
		});
		linkVisitorToContactMock.mockResolvedValue(undefined);
		findVisitorForWebsiteMock.mockResolvedValue({
			id: "visitor-1",
			websiteId: "site-1",
		});
	});

	it("rejects the private contact list endpoint for public API keys", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				page: 1,
				limit: 20,
				search: undefined,
				sortBy: undefined,
				sortOrder: undefined,
				visitorStatus: "all",
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/", {
				method: "GET",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(403);
		expect(payload).toEqual({
			error: "FORBIDDEN",
			message: "Private API key required",
		});
		expect(listContactsMock).toHaveBeenCalledTimes(0);
	});

	it("lists contacts with pagination, search, and sorting for private API keys", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				page: 2,
				limit: 10,
				search: "alice",
				sortBy: "updatedAt",
				sortOrder: "desc",
				visitorStatus: "withVisitors",
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/?page=2&limit=10&search=alice", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(listContactsMock).toHaveBeenCalledWith(
			{},
			{
				websiteId: "site-1",
				organizationId: "org-1",
				page: 2,
				limit: 10,
				search: "alice",
				sortBy: "updatedAt",
				sortOrder: "desc",
				visitorStatus: "withVisitors",
			}
		);
	});

	it("keeps the identify route working for private API key callers", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			body: {
				visitorId: "visitor-1",
				externalId: "crm_1",
				email: undefined,
				name: "Alice",
			},
			visitorIdHeader: null,
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/identify", {
				method: "POST",
			})
		);

		expect(response.status).toBe(200);
		expect(identifyContactMock).toHaveBeenCalledTimes(1);
	});
});
