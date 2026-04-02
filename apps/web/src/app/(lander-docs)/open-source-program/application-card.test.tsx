import { describe, expect, it } from "bun:test";
import {
	flattenWebsiteOptions,
	getDefaultWebsiteId,
	getOpenSourceProgramApplicationCardState,
} from "./application-card";

function createOrganizations(
	websites: Array<{
		id: string;
		name: string;
		domain: string;
		logoUrl: string | null;
	}>
) {
	return [
		{
			organization: {
				id: "org_1",
				name: "Acme",
				slug: "acme",
			},
			role: "owner",
			joinedAt: "2026-03-24T00:00:00.000Z",
			websites,
		},
	];
}

describe("OpenSourceProgramApplicationCard helpers", () => {
	it("flattens organization websites into picker options", () => {
		const result = flattenWebsiteOptions(
			createOrganizations([
				{
					id: "site_1",
					name: "Docs",
					domain: "docs.acme.dev",
					logoUrl: null,
				},
				{
					id: "site_2",
					name: "App",
					domain: "app.acme.dev",
					logoUrl: "https://cdn.plasma-pandora.com/logo.png",
				},
			]) as never
		);

		expect(result).toEqual([
			{
				id: "site_1",
				name: "Docs",
				domain: "docs.acme.dev",
				logoUrl: null,
				organizationName: "Acme",
			},
			{
				id: "site_2",
				name: "App",
				domain: "app.acme.dev",
				logoUrl: "https://cdn.plasma-pandora.com/logo.png",
				organizationName: "Acme",
			},
		]);
	});

	it("returns the only website id as the default selection", () => {
		expect(
			getDefaultWebsiteId([
				{
					id: "site_1",
					name: "Docs",
					domain: "docs.acme.dev",
					logoUrl: null,
					organizationName: "Acme",
				},
			])
		).toBe("site_1");
	});

	it("leaves the default selection empty when multiple websites exist", () => {
		expect(
			getDefaultWebsiteId([
				{
					id: "site_1",
					name: "Docs",
					domain: "docs.acme.dev",
					logoUrl: null,
					organizationName: "Acme",
				},
				{
					id: "site_2",
					name: "App",
					domain: "app.acme.dev",
					logoUrl: null,
					organizationName: "Acme",
				},
			])
		).toBe("");
	});

	it("derives the logged-out gate state", () => {
		expect(
			getOpenSourceProgramApplicationCardState({
				isSessionPending: false,
				hasUser: false,
				isOrganizationsLoading: false,
				websiteCount: 0,
				submissionMessage: null,
			})
		).toBe("logged-out");
	});

	it("derives the no-website state for authenticated users", () => {
		expect(
			getOpenSourceProgramApplicationCardState({
				isSessionPending: false,
				hasUser: true,
				isOrganizationsLoading: false,
				websiteCount: 0,
				submissionMessage: null,
			})
		).toBe("no-websites");
	});

	it("derives the form state when multiple websites are available", () => {
		expect(
			getOpenSourceProgramApplicationCardState({
				isSessionPending: false,
				hasUser: true,
				isOrganizationsLoading: false,
				websiteCount: 2,
				submissionMessage: null,
			})
		).toBe("form");
	});

	it("derives the success state when a submission message exists", () => {
		expect(
			getOpenSourceProgramApplicationCardState({
				isSessionPending: false,
				hasUser: true,
				isOrganizationsLoading: false,
				websiteCount: 1,
				submissionMessage: "Sent",
			})
		).toBe("success");
	});
});
