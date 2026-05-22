import { describe, expect, it } from "bun:test";
import { getOrganizationOwnerEmailRecipients } from "./openrouter-byok";

function createMemberRowsDb(rows: Record<string, unknown>[]) {
	return {
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: async () => rows,
				}),
			}),
		}),
	};
}

describe("getOrganizationOwnerEmailRecipients", () => {
	it("returns only organization owners with deliverable email addresses", async () => {
		const db = createMemberRowsDb([
			{
				memberId: "member_owner",
				userId: "user_owner",
				name: "Owner",
				email: "owner@example.com",
				role: "owner",
			},
			{
				memberId: "member_composite",
				userId: "user_composite",
				name: "Composite Owner",
				email: "composite@example.com",
				role: "admin, owner",
			},
			{
				memberId: "member_admin",
				userId: "user_admin",
				name: "Admin",
				email: "admin@example.com",
				role: "admin",
			},
			{
				memberId: "member_empty_email",
				userId: "user_empty_email",
				name: "No Email",
				email: "",
				role: "owner",
			},
		]);

		const recipients = await getOrganizationOwnerEmailRecipients(db as never, {
			organizationId: "org_1",
		});

		expect(recipients).toEqual([
			{
				memberId: "member_owner",
				userId: "user_owner",
				name: "Owner",
				email: "owner@example.com",
			},
			{
				memberId: "member_composite",
				userId: "user_composite",
				name: "Composite Owner",
				email: "composite@example.com",
			},
		]);
	});
});
