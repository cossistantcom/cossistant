import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);

const findVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const updateVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const blockVisitorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const unblockVisitorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const listConversationsHeadersMock = mock((async () => ({
	items: [],
	nextCursor: null,
})) as (...args: unknown[]) => Promise<unknown>);
const resolvePrivateApiKeyActorUserMock = mock((async () => ({
	userId: "user-1",
	member: {
		id: "member-1",
		userId: "user-1",
	},
	source: "linked_key",
})) as (...args: unknown[]) => Promise<unknown>);
const createConversationEventMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const trackVisitorEventMock = mock((() => {}) as (...args: unknown[]) => void);
const trackVisitorActivityMock = mock((() => {}) as (
	...args: unknown[]
) => void);
const realtimeEmitMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const markVisitorPresenceMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const lookupGeoIpMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

const getContactForVisitorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const mergeContactMetadataMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const mockEnv = {
	NODE_ENV: "development",
	LOCAL_VISITOR_IP_OVERRIDE: "",
};

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries/visitor", () => ({
	findVisitorForWebsite: findVisitorForWebsiteMock,
	updateVisitorForWebsite: updateVisitorForWebsiteMock,
}));

mock.module("@api/db/mutations/visitor", () => ({
	blockVisitor: blockVisitorMock,
	unblockVisitor: unblockVisitorMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	listConversationsHeaders: listConversationsHeadersMock,
}));

mock.module("@api/db/queries/contact", () => ({
	getContactForVisitor: getContactForVisitorMock,
	mergeContactMetadata: mergeContactMetadataMock,
}));

mock.module("@api/lib/private-api-key-actor", () => ({
	resolvePrivateApiKeyActorUser: resolvePrivateApiKeyActorUserMock,
}));

mock.module("@api/utils/conversation-event", () => ({
	createConversationEvent: createConversationEventMock,
}));

mock.module("@api/lib/tinybird-sdk", () => ({
	trackVisitorEvent: trackVisitorEventMock,
	trackVisitorActivity: trackVisitorActivityMock,
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("@api/services/presence", () => ({
	markVisitorPresence: markVisitorPresenceMock,
}));

mock.module("@api/services/geoip", () => ({
	lookupGeoIp: lookupGeoIpMock,
}));

mock.module("@api/env", () => ({
	env: mockEnv,
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
}));

const visitorRouterModulePromise = import("./visitor");

function createVisitorRecord(
	overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
	return {
		id: "visitor-1",
		browser: null,
		browserVersion: null,
		os: null,
		osVersion: null,
		device: null,
		deviceType: null,
		ip: null,
		city: null,
		region: null,
		country: null,
		countryCode: null,
		latitude: null,
		longitude: null,
		geoSource: null,
		geoAccuracyRadiusKm: null,
		geoResolvedAt: null,
		language: null,
		timezone: null,
		screenResolution: null,
		viewport: null,
		contactId: null,
		organizationId: "org-1",
		websiteId: "site-1",
		userId: null,
		isTest: false,
		blockedAt: null,
		blockedByUserId: null,
		lastSeenAt: "2026-03-03T00:00:00.000Z",
		createdAt: "2026-03-03T00:00:00.000Z",
		updatedAt: "2026-03-03T00:00:00.000Z",
		deletedAt: null,
		attribution: null,
		currentPage: null,
		...overrides,
	};
}

describe("visitor route PATCH /:id countryCode handling", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		validateResponseMock.mockReset();
		findVisitorForWebsiteMock.mockReset();
		updateVisitorForWebsiteMock.mockReset();
		blockVisitorMock.mockReset();
		unblockVisitorMock.mockReset();
		listConversationsHeadersMock.mockReset();
		resolvePrivateApiKeyActorUserMock.mockReset();
		createConversationEventMock.mockReset();
		getContactForVisitorMock.mockReset();
		mergeContactMetadataMock.mockReset();
		trackVisitorEventMock.mockReset();
		trackVisitorActivityMock.mockReset();
		realtimeEmitMock.mockReset();
		markVisitorPresenceMock.mockReset();
		lookupGeoIpMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		findVisitorForWebsiteMock.mockResolvedValue(createVisitorRecord());
		updateVisitorForWebsiteMock.mockResolvedValue(createVisitorRecord());
		blockVisitorMock.mockResolvedValue(
			createVisitorRecord({
				blockedAt: "2026-03-03T12:00:00.000Z",
				blockedByUserId: "user-1",
			})
		);
		unblockVisitorMock.mockResolvedValue(createVisitorRecord());
		listConversationsHeadersMock.mockResolvedValue({
			items: [
				{
					id: "conv-1",
				},
			],
			nextCursor: null,
		});
		resolvePrivateApiKeyActorUserMock.mockResolvedValue({
			userId: "user-1",
			member: {
				id: "member-1",
				userId: "user-1",
			},
			source: "linked_key",
		});
		createConversationEventMock.mockResolvedValue(null);
		getContactForVisitorMock.mockResolvedValue(null);
		mergeContactMetadataMock.mockResolvedValue();
		realtimeEmitMock.mockResolvedValue(undefined);
		markVisitorPresenceMock.mockResolvedValue(undefined);
		lookupGeoIpMock.mockResolvedValue(null);
		mockEnv.NODE_ENV = "development";
		mockEnv.LOCAL_VISITOR_IP_OVERRIDE = "";
	});

	it("requires a private actor to block a visitor", async () => {
		resolvePrivateApiKeyActorUserMock.mockResolvedValueOnce(null);
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: null },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
			body: null,
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1/block", {
				method: "POST",
			})
		);

		expect(response.status).toBe(400);
		expect(blockVisitorMock).not.toHaveBeenCalled();
	});

	it("blocks and unblocks a visitor with a resolved private actor", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
			body: null,
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const blockResponse = await visitorRouter.request(
			new Request("http://localhost/visitor-1/block", {
				method: "POST",
			})
		);
		const unblockResponse = await visitorRouter.request(
			new Request("http://localhost/visitor-1/unblock", {
				method: "POST",
			})
		);

		expect(blockResponse.status).toBe(200);
		expect(unblockResponse.status).toBe(200);
		expect(blockVisitorMock).toHaveBeenCalledWith(
			{},
			{
				visitor: expect.objectContaining({ id: "visitor-1" }),
				actorUserId: "user-1",
			}
		);
		expect(unblockVisitorMock).toHaveBeenCalledWith(
			{},
			{
				visitor: expect.objectContaining({ id: "visitor-1" }),
				actorUserId: "user-1",
			}
		);
		expect(createConversationEventMock).toHaveBeenCalledTimes(2);
	});

	it("does not persist locale macro-region values like es-419 as countryCode", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				language: "es-419",
				timezone: "America/Cancun",
				city: "Cancun",
			},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
				headers: {
					"accept-language": "es-419",
				},
			})
		);

		expect(response.status).toBe(200);
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(1);

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: { countryCode?: string };
		};
		expect(updateArg.data.countryCode).toBeUndefined();
	});

	it("returns 400 when body countryCode is invalid", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				countryCode: "419",
			},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			error: "BAD_REQUEST",
			message: "countryCode must be a valid ISO 3166-1 alpha-2 code",
		});
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(0);
	});

	it("normalizes valid body countryCode to uppercase alpha-2", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				countryCode: "mx",
			},
		});
		updateVisitorForWebsiteMock.mockResolvedValue(
			createVisitorRecord({ countryCode: "MX" })
		);

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
			})
		);

		expect(response.status).toBe(200);
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(1);

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: { countryCode?: string };
		};
		expect(updateArg.data.countryCode).toBe("MX");
	});

	it("prefers Railway x-forwarded-for geo over browser-supplied city", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				city: "Bangkok",
				timezone: "Asia/Bangkok",
				language: "th-TH",
			},
		});
		lookupGeoIpMock.mockResolvedValue({
			ip: "8.8.8.8",
			found: true,
			is_public: true,
			country_code: "US",
			country: "United States",
			region: "California",
			city: "Mountain View",
			latitude: 37.386,
			longitude: -122.0838,
			timezone: "America/Los_Angeles",
			accuracy_radius_km: 20,
			asn: 15_169,
			asn_organization: "Google LLC",
			source: "maxmind",
			resolved_at: "2026-03-28T00:00:00.000Z",
		});
		updateVisitorForWebsiteMock.mockResolvedValue(
			createVisitorRecord({
				ip: "8.8.8.8",
				city: "Mountain View",
				region: "California",
				country: "United States",
				countryCode: "US",
				latitude: 37.386,
				longitude: -122.0838,
				timezone: "Asia/Bangkok",
			})
		);

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
				headers: {
					"x-forwarded-for": "8.8.8.8, 44.44.44.44",
					"x-real-ip": "44.44.44.44",
				},
			})
		);

		expect(response.status).toBe(200);
		expect(lookupGeoIpMock).toHaveBeenCalledWith("8.8.8.8");

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: {
				ip?: string;
				city?: string | null;
				region?: string | null;
				country?: string | null;
				countryCode?: string | null;
				timezone?: string | null;
				geoSource?: string | null;
			};
		};
		expect(updateArg.data.ip).toBe("8.8.8.8");
		expect(updateArg.data.city).toBe("Mountain View");
		expect(updateArg.data.region).toBe("California");
		expect(updateArg.data.countryCode).toBe("US");
		expect(updateArg.data.timezone).toBe("Asia/Bangkok");
		expect(updateArg.data.geoSource).toBe("maxmind");
	});

	it("uses the local development IP override when localhost traffic has no public IP", async () => {
		mockEnv.LOCAL_VISITOR_IP_OVERRIDE = "8.8.8.8";
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {},
		});
		lookupGeoIpMock.mockResolvedValue({
			ip: "8.8.8.8",
			found: true,
			is_public: true,
			country_code: "US",
			country: "United States",
			region: "California",
			city: "Mountain View",
			latitude: 37.386,
			longitude: -122.0838,
			timezone: "America/Los_Angeles",
			accuracy_radius_km: 20,
			asn: 15_169,
			asn_organization: "Google LLC",
			source: "maxmind",
			resolved_at: "2026-03-28T00:00:00.000Z",
		});
		updateVisitorForWebsiteMock.mockResolvedValue(
			createVisitorRecord({
				ip: "8.8.8.8",
				city: "Mountain View",
				region: "California",
				country: "United States",
				countryCode: "US",
				latitude: 37.386,
				longitude: -122.0838,
				timezone: "America/Los_Angeles",
				geoSource: "maxmind",
			})
		);

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
				headers: {
					"x-real-ip": "127.0.0.1",
				},
			})
		);

		expect(response.status).toBe(200);
		expect(lookupGeoIpMock).toHaveBeenCalledWith("8.8.8.8");

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: {
				ip?: string;
				city?: string | null;
				region?: string | null;
				countryCode?: string | null;
				latitude?: number | null;
				longitude?: number | null;
				timezone?: string | null;
				geoSource?: string | null;
			};
		};
		expect(updateArg.data.ip).toBe("8.8.8.8");
		expect(updateArg.data.city).toBe("Mountain View");
		expect(updateArg.data.region).toBe("California");
		expect(updateArg.data.countryCode).toBe("US");
		expect(updateArg.data.latitude).toBe(37.386);
		expect(updateArg.data.longitude).toBe(-122.0838);
		expect(updateArg.data.timezone).toBe("America/Los_Angeles");
		expect(updateArg.data.geoSource).toBe("maxmind");
	});

	it("falls back to edge header geo when the geo service is unavailable", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
				headers: {
					"x-real-ip": "8.8.8.8",
					"cf-ipcity": "Paris",
					"cf-ipcountry": "FR",
					"cf-ipregion": "Ile-de-France",
				},
			})
		);

		expect(response.status).toBe(200);

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: {
				ip?: string;
				city?: string | null;
				region?: string | null;
				countryCode?: string | null;
				geoSource?: string | null;
			};
		};
		expect(updateArg.data.ip).toBe("8.8.8.8");
		expect(updateArg.data.city).toBe("Paris");
		expect(updateArg.data.region).toBe("Ile-de-France");
		expect(updateArg.data.countryCode).toBe("FR");
		expect(updateArg.data.geoSource).toBe("edge_header");
	});

	it("clears stale geo when the visitor IP changes and no replacement geo is available", async () => {
		findVisitorForWebsiteMock.mockResolvedValue(
			createVisitorRecord({
				ip: "1.1.1.1",
				city: "Paris",
				region: "Ile-de-France",
				country: "France",
				countryCode: "FR",
				latitude: 48.8566,
				longitude: 2.3522,
				geoSource: "maxmind",
			})
		);
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
				headers: {
					"x-real-ip": "8.8.8.8",
				},
			})
		);

		expect(response.status).toBe(200);

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: {
				ip?: string;
				city?: string | null;
				region?: string | null;
				country?: string | null;
				countryCode?: string | null;
				latitude?: number | null;
				longitude?: number | null;
				geoSource?: string | null;
			};
		};
		expect(updateArg.data.ip).toBe("8.8.8.8");
		expect(updateArg.data.city).toBeNull();
		expect(updateArg.data.region).toBeNull();
		expect(updateArg.data.country).toBeNull();
		expect(updateArg.data.countryCode).toBeNull();
		expect(updateArg.data.latitude).toBeNull();
		expect(updateArg.data.longitude).toBeNull();
		expect(updateArg.data.geoSource).toBeNull();
	});

	it("preserves first-touch attribution while updating current page and tracks page views", async () => {
		const existingAttribution = {
			version: 1 as const,
			firstTouch: {
				channel: "referral" as const,
				isDirect: false,
				referrer: {
					url: "https://news.ycombinator.com/item",
					domain: "news.ycombinator.com",
				},
				landing: {
					url: "https://app.example.com/pricing?utm_source=hn",
					path: "/pricing",
					title: "Pricing | Cossistant",
				},
				utm: {
					source: "hn",
					medium: "referral",
					campaign: "launch",
					content: null,
					term: null,
				},
				clickIds: {
					gclid: null,
					gbraid: null,
					wbraid: null,
					fbclid: null,
					msclkid: null,
					ttclid: null,
					li_fat_id: null,
					twclid: null,
				},
				capturedAt: "2026-03-03T00:00:00.000Z",
			},
		};
		const incomingAttribution = {
			version: 1 as const,
			firstTouch: {
				channel: "paid" as const,
				isDirect: false,
				referrer: {
					url: "https://google.com",
					domain: "google.com",
				},
				landing: {
					url: "https://app.example.com/docs?utm_source=google&utm_medium=cpc&gclid=gclid_123",
					path: "/docs",
					title: "Docs | Cossistant",
				},
				utm: {
					source: "google",
					medium: "cpc",
					campaign: "brand",
					content: null,
					term: null,
				},
				clickIds: {
					gclid: "gclid_123",
					gbraid: null,
					wbraid: null,
					fbclid: null,
					msclkid: null,
					ttclid: null,
					li_fat_id: null,
					twclid: null,
				},
				capturedAt: "2026-03-04T00:00:00.000Z",
			},
		};
		const nextCurrentPage = {
			url: "https://app.example.com/docs?utm_source=newsletter",
			path: "/docs",
			title: "Docs | Cossistant",
			referrerUrl: "https://news.ycombinator.com/item",
			updatedAt: "2026-03-05T00:00:00.000Z",
		};

		findVisitorForWebsiteMock.mockResolvedValue(
			createVisitorRecord({
				attribution: existingAttribution,
				currentPage: {
					url: "https://app.example.com/pricing?utm_source=hn",
					path: "/pricing",
					title: "Pricing | Cossistant",
					referrerUrl: "https://news.ycombinator.com/item",
					updatedAt: "2026-03-03T00:00:00.000Z",
				},
			})
		);
		updateVisitorForWebsiteMock.mockImplementation(async (_db, params) =>
			createVisitorRecord({
				attribution: (params as { data: { attribution: unknown } }).data
					.attribution,
				currentPage: (params as { data: { currentPage: unknown } }).data
					.currentPage,
			})
		);
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				attribution: incomingAttribution,
				currentPage: nextCurrentPage,
			},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
			})
		);

		expect(response.status).toBe(200);
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(1);
		expect(trackVisitorEventMock).toHaveBeenCalledTimes(1);
		expect(trackVisitorActivityMock).toHaveBeenCalledTimes(1);

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: {
				attribution: unknown;
				currentPage: unknown;
			};
		};
		expect(updateArg.data.attribution).toEqual(existingAttribution);
		expect(updateArg.data.currentPage).toEqual(nextCurrentPage);
		expect(trackVisitorEventMock.mock.calls[0]?.[0]).toMatchObject({
			website_id: "site-1",
			visitor_id: "visitor-1",
			event_type: "page_view",
			page_url: "https://app.example.com/docs?utm_source=newsletter",
			page_path: "/docs",
			attribution_channel: "referral",
			attribution_referrer_domain: "news.ycombinator.com",
		});
		expect(trackVisitorActivityMock.mock.calls[0]?.[0]).toMatchObject({
			website_id: "site-1",
			visitor_id: "visitor-1",
			session_id: "visitor-1",
			event_type: "page_sync",
			page_url: "https://app.example.com/docs?utm_source=newsletter",
			page_path: "/docs",
			page_title: "Docs | Cossistant",
			page_referrer_url: "https://news.ycombinator.com/item",
			attribution_channel: "referral",
		});
	});

	it("returns 404 when posting live activity for an unknown visitor", async () => {
		findVisitorForWebsiteMock.mockResolvedValue(null);
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				sessionId: "session-1",
				activityType: "heartbeat",
				attribution: {
					version: 1,
					firstTouch: {
						channel: "referral",
						isDirect: false,
						referrer: {
							url: "https://news.ycombinator.com/item?id=1",
							domain: "news.ycombinator.com",
						},
						landing: {
							url: "https://app.example.com/pricing?utm_source=hn",
							path: "/pricing",
							title: "Pricing | Cossistant",
						},
						utm: {
							source: "hn",
							medium: "referral",
							campaign: "launch",
							content: null,
							term: null,
						},
						clickIds: {
							gclid: null,
							gbraid: null,
							wbraid: null,
							fbclid: null,
							msclkid: null,
							ttclid: null,
							li_fat_id: null,
							twclid: null,
						},
						capturedAt: "2026-03-26T10:00:00.000Z",
					},
				},
				currentPage: {
					url: "https://app.example.com/pricing?utm_source=hn",
					path: "/pricing",
					title: "Pricing | Cossistant",
					referrerUrl: "https://news.ycombinator.com/item?id=1",
					updatedAt: "2026-03-26T10:00:00.000Z",
				},
			},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-missing/activity", {
				method: "POST",
			})
		);

		expect(response.status).toBe(404);
		expect(trackVisitorActivityMock).not.toHaveBeenCalled();
		expect(markVisitorPresenceMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("tracks live activity with last-known geo and emits dashboard invalidation", async () => {
		const attribution = {
			version: 1 as const,
			firstTouch: {
				channel: "paid" as const,
				isDirect: false,
				referrer: {
					url: "https://google.com",
					domain: "google.com",
				},
				landing: {
					url: "https://app.example.com/docs?utm_source=google&utm_medium=cpc&gclid=gclid_123",
					path: "/docs",
					title: "Docs | Cossistant",
				},
				utm: {
					source: "google",
					medium: "cpc",
					campaign: "brand",
					content: null,
					term: null,
				},
				clickIds: {
					gclid: "gclid_123",
					gbraid: null,
					wbraid: null,
					fbclid: null,
					msclkid: null,
					ttclid: null,
					li_fat_id: null,
					twclid: null,
				},
				capturedAt: "2026-03-26T10:00:00.000Z",
			},
		};
		const currentPage = {
			url: "https://app.example.com/docs?utm_source=google&utm_medium=cpc&gclid=gclid_123",
			path: "/docs",
			title: "Docs | Cossistant",
			referrerUrl: "https://google.com",
			updatedAt: "2026-03-26T10:00:00.000Z",
		};
		findVisitorForWebsiteMock.mockResolvedValue(
			createVisitorRecord({
				city: "Paris",
				countryCode: "FR",
				latitude: 48.8566,
				longitude: 2.3522,
			})
		);
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				sessionId: "session-1",
				activityType: "heartbeat",
				attribution,
				currentPage,
			},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1/activity", {
				method: "POST",
			})
		);
		const payload = (await response.json()) as {
			ok: boolean;
			acceptedAt: string;
		};

		expect(response.status).toBe(200);
		expect(payload.ok).toBe(true);
		expect(typeof payload.acceptedAt).toBe("string");
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(1);
		expect(updateVisitorForWebsiteMock.mock.calls[0]?.[1]).toMatchObject({
			visitorId: "visitor-1",
			websiteId: "site-1",
			data: {
				lastSeenAt: payload.acceptedAt,
				updatedAt: payload.acceptedAt,
			},
		});
		expect(trackVisitorActivityMock).toHaveBeenCalledTimes(1);
		expect(trackVisitorActivityMock.mock.calls[0]?.[0]).toMatchObject({
			website_id: "site-1",
			visitor_id: "visitor-1",
			session_id: "session-1",
			event_type: "heartbeat",
			city: "Paris",
			country_code: "FR",
			latitude: 48.8566,
			longitude: 2.3522,
			page_path: "/docs",
			attribution_channel: "paid",
			attribution_referrer_domain: "google.com",
		});
		expect(markVisitorPresenceMock).toHaveBeenCalledTimes(1);
		expect(markVisitorPresenceMock.mock.calls[0]?.[0]).toMatchObject({
			websiteId: "site-1",
			visitorId: "visitor-1",
			geo: {
				city: "Paris",
				countryCode: "FR",
				latitude: 48.8566,
				longitude: 2.3522,
			},
		});
		expect(realtimeEmitMock).toHaveBeenCalledTimes(1);
		expect(realtimeEmitMock.mock.calls[0]).toEqual([
			"visitorPresenceUpdate",
			expect.objectContaining({
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-1",
				userId: null,
				sessionId: "session-1",
				activityType: "heartbeat",
				attribution,
				currentPage,
			}),
		]);
	});
});
