import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	ConversationStatus,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "../enums";
import { conversationSchema } from "../schemas";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./common";
import { feedbackSchema } from "./feedback";
import { knowledgeResponseSchema } from "./knowledge";
import { generateUploadUrlResponseSchema } from "./upload";
import { visitorResponseSchema } from "./visitor";
import { publicWebsiteResponseSchema } from "./website";

describe("apiTimestampSchema", () => {
	it("normalizes parseable timestamps to canonical UTC millisecond precision", () => {
		assert.equal(
			apiTimestampSchema.parse("2026-04-06T14:37:05.82+00:00"),
			"2026-04-06T14:37:05.820Z"
		);
		assert.equal(
			apiTimestampSchema.parse("2026-04-06T14:37:02.996+00:00"),
			"2026-04-06T14:37:02.996Z"
		);
		assert.equal(
			apiTimestampSchema.parse("2026-04-06T14:42:01.123456+00:00"),
			"2026-04-06T14:42:01.123Z"
		);
		assert.equal(
			apiTimestampSchema.parse("2026-04-06T14:42:01+00:00"),
			"2026-04-06T14:42:01.000Z"
		);
		assert.equal(
			apiTimestampSchema.parse(new Date("2026-04-06T14:37:05.820Z")),
			"2026-04-06T14:37:05.820Z"
		);
		assert.equal(nullableApiTimestampSchema.parse(null), null);
	});
});

describe("REST timestamp serialization", () => {
	it("normalizes conversation timestamps including nested timeline items", () => {
		const parsed = conversationSchema.parse({
			id: "conv_1",
			title: "Support thread",
			createdAt: "2026-04-06T14:37:05.82+00:00",
			updatedAt: "2026-04-06T14:37:02.996+00:00",
			visitorId: "visitor_1",
			websiteId: "site_1",
			status: ConversationStatus.OPEN,
			visitorRating: null,
			visitorRatingAt: "2026-04-06T14:42:01.72+00:00",
			deletedAt: null,
			visitorLastSeenAt: "2026-04-06T14:42:01+00:00",
			lastTimelineItem: {
				id: "item_1",
				conversationId: "conv_1",
				organizationId: "org_1",
				visibility: TimelineItemVisibility.PUBLIC,
				type: ConversationTimelineType.MESSAGE,
				text: "Hello there",
				tool: null,
				parts: [],
				userId: null,
				aiAgentId: null,
				visitorId: "visitor_1",
				createdAt: "2026-04-06 14:37:05.123456+00",
				deletedAt: null,
			},
		});

		assert.equal(parsed.createdAt, "2026-04-06T14:37:05.820Z");
		assert.equal(parsed.updatedAt, "2026-04-06T14:37:02.996Z");
		assert.equal(parsed.visitorRatingAt, "2026-04-06T14:42:01.720Z");
		assert.equal(parsed.visitorLastSeenAt, "2026-04-06T14:42:01.000Z");
		assert.equal(
			parsed.lastTimelineItem?.createdAt,
			"2026-04-06T14:37:05.123Z"
		);
	});

	it("normalizes visitor and website response timestamps", () => {
		const visitor = visitorResponseSchema.parse({
			id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
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
			language: null,
			timezone: null,
			screenResolution: null,
			viewport: null,
			createdAt: "2026-03-12T10:00:00+00:00",
			updatedAt: "2026-03-12T10:00:05.123456+00:00",
			lastSeenAt: "2026-03-12T10:00:06.2+00:00",
			websiteId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
			organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
			blockedAt: "2026-03-12T10:00:07+00:00",
			blockedByUserId: null,
			isBlocked: false,
			attribution: {
				version: 1,
				firstTouch: {
					channel: "referral",
					isDirect: false,
					referrer: { url: null, domain: null },
					landing: { url: null, path: null, title: null },
					utm: {
						source: null,
						medium: null,
						campaign: null,
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
					capturedAt: "2026-03-12 10:00:00.72+00",
				},
			},
			currentPage: {
				url: null,
				path: null,
				title: null,
				referrerUrl: null,
				updatedAt: "2026-03-12T10:00:05.1+00:00",
			},
			contact: null,
		});

		assert.equal(visitor.createdAt, "2026-03-12T10:00:00.000Z");
		assert.equal(visitor.updatedAt, "2026-03-12T10:00:05.123Z");
		assert.equal(visitor.lastSeenAt, "2026-03-12T10:00:06.200Z");
		assert.equal(visitor.blockedAt, "2026-03-12T10:00:07.000Z");
		assert.equal(
			visitor.attribution?.firstTouch.capturedAt,
			"2026-03-12T10:00:00.720Z"
		);
		assert.equal(visitor.currentPage?.updatedAt, "2026-03-12T10:00:05.100Z");

		const website = publicWebsiteResponseSchema.parse({
			id: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
			name: "Example",
			domain: "example.com",
			description: null,
			logoUrl: null,
			organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
			status: "active",
			lastOnlineAt: "2026-04-06T14:37:05+00:00",
			availableHumanAgents: [
				{
					id: "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
					name: "Jane",
					image: null,
					lastSeenAt: "2026-04-06T14:37:05.82+00:00",
				},
			],
			availableAIAgents: [],
			visitor: {
				id: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
				isBlocked: false,
				language: null,
				contact: null,
			},
		});

		assert.equal(website.lastOnlineAt, "2026-04-06T14:37:05.000Z");
		assert.equal(
			website.availableHumanAgents[0]?.lastSeenAt,
			"2026-04-06T14:37:05.820Z"
		);
	});

	it("normalizes feedback, knowledge, and upload response timestamps", () => {
		const feedback = feedbackSchema.parse({
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
		});

		assert.equal(feedback.createdAt, "2026-04-06T14:37:05.820Z");
		assert.equal(feedback.updatedAt, "2026-04-06T14:37:02.996Z");

		const knowledge = knowledgeResponseSchema.parse({
			id: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
			organizationId: "01ARZ3NDEKTSV4RRFFQ69G5FB2",
			websiteId: "01ARZ3NDEKTSV4RRFFQ69G5FB3",
			aiAgentId: null,
			linkSourceId: null,
			type: "url",
			sourceUrl: "https://docs.cossistant.com/getting-started",
			sourceTitle: "Getting started",
			origin: "crawl",
			createdBy: "user_1",
			contentHash: "hash",
			payload: {
				markdown: "# Welcome",
				headings: [],
				links: [],
				images: [],
			},
			metadata: null,
			isIncluded: true,
			sizeBytes: 1024,
			createdAt: "2024-06-10T12:00:00.8+00:00",
			updatedAt: "2024-06-11 08:00:00.123456+00",
			deletedAt: "2024-06-12T09:00:00+00:00",
		});

		assert.equal(knowledge.createdAt, "2024-06-10T12:00:00.800Z");
		assert.equal(knowledge.updatedAt, "2024-06-11T08:00:00.123Z");
		assert.equal(knowledge.deletedAt, "2024-06-12T09:00:00.000Z");

		const upload = generateUploadUrlResponseSchema.parse({
			uploadUrl:
				"https://example-bucket.s3.amazonaws.com/org-id/file.png?X-Amz-Signature=test",
			key: "01JG000000000000000000000/assets/file.png",
			bucket: "cossistant-uploads",
			expiresAt: "2024-01-01T12:00:00.72+00:00",
			contentType: "image/png",
			publicUrl: "https://cdn.example.com/org-id/file.png",
		});

		assert.equal(upload.expiresAt, "2024-01-01T12:00:00.720Z");
	});
});
