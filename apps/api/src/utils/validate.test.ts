import { describe, expect, it } from "bun:test";
import { feedbackSchema } from "@cossistant/types/api/feedback";
import { validateResponse } from "./validate";

describe("validateResponse", () => {
	it("returns schema-transformed timestamp data", () => {
		const result = validateResponse(
			{
				id: "feedback_1",
				organizationId: "org_1",
				websiteId: "site_1",
				conversationId: null,
				visitorId: null,
				contactId: null,
				rating: 5,
				topic: null,
				comment: null,
				trigger: null,
				source: "widget",
				createdAt: "2026-04-06T14:37:05.82+00:00",
				updatedAt: "2026-04-06T14:37:02.996+00:00",
			},
			feedbackSchema
		);

		expect(result.createdAt).toBe("2026-04-06T14:37:05.820Z");
		expect(result.updatedAt).toBe("2026-04-06T14:37:02.996Z");
	});
});
