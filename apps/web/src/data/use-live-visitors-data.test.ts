import { describe, expect, it } from "bun:test";
import { mergeLiveVisitorEntities } from "./use-live-visitors-data";

describe("mergeLiveVisitorEntities", () => {
	it("overrides anonymous live identity fields with presence profile data", () => {
		const result = mergeLiveVisitorEntities({
			entities: [
				{
					attribution_channel: "paid",
					city: "Paris",
					country_code: "FR",
					entity_id: "visitor-1",
					entity_type: "visitor",
					image: "",
					last_seen: "2026-04-01T10:00:00.000Z",
					latitude: 48.8566,
					longitude: 2.3522,
					name: "",
					page_path: "/pricing",
				},
				{
					attribution_channel: "organic",
					city: "Lyon",
					country_code: "FR",
					entity_id: "visitor-2",
					entity_type: "visitor",
					image: "https://example.com/existing.png",
					last_seen: "2026-04-01T09:55:00.000Z",
					latitude: 45.764,
					longitude: 4.8357,
					name: "Existing Name",
					page_path: "/docs",
				},
			],
			profilesByVisitorId: {
				"visitor-1": {
					id: "visitor-1",
					lastSeenAt: "2026-04-01T10:00:00.000Z",
					city: "Marseille",
					region: "Provence-Alpes-Cote d'Azur",
					country: "France",
					latitude: 43.2965,
					longitude: 5.3698,
					contactId: "contact-1",
					contactName: "Profile Name",
					contactEmail: "profile@example.com",
					contactImage: "https://example.com/profile.png",
				},
			},
		});

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			attribution_channel: "paid",
			city: "Paris",
			contactId: "contact-1",
			email: "profile@example.com",
			entity_id: "visitor-1",
			image: "https://example.com/profile.png",
			name: "Profile Name",
			page_path: "/pricing",
		});
		expect(result[1]).toMatchObject({
			attribution_channel: "organic",
			contactId: null,
			email: null,
			entity_id: "visitor-2",
			image: "https://example.com/existing.png",
			name: "Existing Name",
			page_path: "/docs",
		});
	});

	it("falls back to raw live entities when profiles are missing or unavailable", () => {
		const result = mergeLiveVisitorEntities({
			entities: [
				{
					attribution_channel: null,
					city: null,
					country_code: null,
					entity_id: "visitor-blank",
					entity_type: "visitor",
					image: "",
					last_seen: "2026-04-01T10:00:00.000Z",
					latitude: null,
					longitude: null,
					name: "",
					page_path: "/pricing",
				},
			],
			profilesByVisitorId: null,
		});

		expect(result).toEqual([
			{
				attribution_channel: null,
				city: null,
				contactId: null,
				country_code: null,
				email: null,
				entity_id: "visitor-blank",
				entity_type: "visitor",
				image: "",
				last_seen: "2026-04-01T10:00:00.000Z",
				latitude: null,
				longitude: null,
				name: "",
				page_path: "/pricing",
			},
		]);
	});
});
