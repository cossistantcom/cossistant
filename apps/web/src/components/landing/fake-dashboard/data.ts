import type { RouterOutputs } from "@api/trpc/types";
import type { ConversationHeader } from "@cossistant/types";
import { ConversationStatus } from "@cossistant/types";
import {
	DEMO_DELETE_ACCOUNT_FAQ_TITLE,
	DEMO_DELETE_ACCOUNT_QUESTION,
} from "@/components/demo/demo-copy";
import type { ConversationTimelineItem } from "@/data/conversation-message-cache";

export type FakeVisitor = NonNullable<
	RouterOutputs["conversation"]["getVisitorById"]
>;

export type FakeTypingActor = {
	conversationId: string;
	actorType: "visitor" | "ai_agent";
	actorId: string;
	preview: string | null;
};

export type FakeConversationHandledPayload = {
	conversationId: string;
	handledAt?: string;
	lastTimelineItem: ConversationTimelineItem;
	title?: string | null;
};

export type FakeDashboardScenarioId =
	| "landing_escalation"
	| "promo_delete_account_answered";

// Kept for fake-support-widget compatibility.
export type FakeTypingVisitor = {
	conversationId: string;
	visitorId: string;
	preview: string | null;
};

const ORGANIZATION_ID = "01JGORG11111111111111111";
const WEBSITE_ID = "01JGWEB11111111111111111";

export const ANTHONY_RIERA_ID = "01JGUSER1111111111111111";
export const MARC_CONVERSATION_ID = "01JGAA2222222222222222222";
export const MARC_VISITOR_ID = "01JGVIS22222222222222222";
export const PIETER_VISITOR_ID = "01JGVIS11111111111111111";
export const PIPELINE_TYPING_CONVERSATION_ID = "01JGAA6666666666666666666";

const WAITING_CONVERSATION_ID = "01JGAA1111111111111111111";
const NEEDS_HUMAN_CONVERSATION_ID = "01JGAA4444444444444444444";
const OTHER_CONVERSATION_ID = "01JGAA5555555555555555555";
const RESOLVED_CONVERSATION_ID = "01JGAA3333333333333333333";
const OTHER_CONVERSATION_ID_TWO = "01JGAA7777777777777777777";

export const fakeAIAgent = {
	id: "01JGAIA11111111111111111",
	name: "Cossistant AI",
	image: null,
} as const;

const now = Date.now();

const msAgo = (ms: number) => new Date(now - ms).toISOString();
const minutesAgo = (minutes: number) => msAgo(minutes * 60 * 1000);
const hoursAgo = (hours: number) => msAgo(hours * 60 * 60 * 1000);
const daysAgo = (days: number) => msAgo(days * 24 * 60 * 60 * 1000);

const createFakeVisitor = (partial: {
	id: string;
	lastSeenAt: string;
	contact?: {
		id: string;
		name: string | null;
		email: string | null;
		image: string | null;
	};
	browser?: string;
	browserVersion?: string;
	os?: string;
	osVersion?: string;
	device?: string;
	deviceType?: string;
	country?: string;
	countryCode?: string;
	city?: string;
	region?: string;
	timezone?: string;
	language?: string;
	ip?: string;
	viewport?: string;
}): FakeVisitor =>
	({
		id: partial.id,
		browser: partial.browser ?? null,
		browserVersion: partial.browserVersion ?? null,
		os: partial.os ?? null,
		osVersion: partial.osVersion ?? null,
		device: partial.device ?? null,
		deviceType: partial.deviceType ?? null,
		ip: partial.ip ?? null,
		city: partial.city ?? null,
		region: partial.region ?? null,
		country: partial.country ?? null,
		countryCode: partial.countryCode ?? null,
		latitude: null,
		longitude: null,
		language: partial.language ?? null,
		timezone: partial.timezone ?? null,
		screenResolution: null,
		viewport: partial.viewport ?? null,
		createdAt: daysAgo(30),
		updatedAt: new Date(now).toISOString(),
		lastSeenAt: partial.lastSeenAt,
		websiteId: WEBSITE_ID,
		organizationId: ORGANIZATION_ID,
		blockedAt: null,
		blockedByUserId: null,
		isBlocked: false,
		attribution: null,
		currentPage: null,
		contact: partial.contact ?? null,
		userId: null,
		isTest: false,
		deletedAt: null,
	}) as FakeVisitor;

const createMessageTimelineItem = (params: {
	id: string;
	conversationId: string;
	text: string;
	createdAt: string;
	visitorId?: string | null;
	userId?: string | null;
	aiAgentId?: string | null;
}): NonNullable<ConversationHeader["lastTimelineItem"]> => ({
	id: params.id,
	conversationId: params.conversationId,
	organizationId: ORGANIZATION_ID,
	visibility: "public",
	type: "message",
	text: params.text,
	parts: [{ type: "text", text: params.text }],
	userId: params.userId ?? null,
	visitorId: params.visitorId ?? null,
	aiAgentId: params.aiAgentId ?? null,
	createdAt: params.createdAt,
	deletedAt: null,
});

const createConversation = (params: {
	id: string;
	visitor: FakeVisitor;
	title: string;
	status?: ConversationHeader["status"];
	priority?: ConversationHeader["priority"];
	startedAt: string;
	updatedAt?: string;
	lastSeenAt?: string | null;
	lastTimelineItem: NonNullable<ConversationHeader["lastTimelineItem"]>;
	escalatedAt?: string | null;
	escalationHandledAt?: string | null;
	escalationReason?: string | null;
	activeClarification?: ConversationHeader["activeClarification"];
	resolvedAt?: string | null;
	resolvedByUserId?: string | null;
	resolvedByAiAgentId?: string | null;
}): ConversationHeader => {
	const updatedAt =
		params.updatedAt ?? params.lastTimelineItem?.createdAt ?? params.startedAt;
	const resolvedAt = params.resolvedAt ?? null;

	return {
		id: params.id,
		status: params.status ?? ConversationStatus.OPEN,
		priority: params.priority ?? "normal",
		prioritySource: null,
		organizationId: ORGANIZATION_ID,
		visitorId: params.visitor.id,
		visitor: params.visitor as ConversationHeader["visitor"],
		websiteId: WEBSITE_ID,
		channel: "widget",
		title: params.title,
		titleSource: null,
		sentiment: null,
		sentimentConfidence: null,
		sentimentSource: null,
		resolutionTime:
			resolvedAt && params.lastTimelineItem
				? Math.max(
						0,
						Date.parse(resolvedAt) -
							Date.parse(params.lastTimelineItem.createdAt)
					)
				: null,
		startedAt: params.startedAt,
		firstResponseAt: null,
		resolvedAt,
		resolvedByUserId: params.resolvedByUserId ?? null,
		resolvedByAiAgentId: params.resolvedByAiAgentId ?? null,
		escalatedAt: params.escalatedAt ?? null,
		escalatedByAiAgentId: params.escalatedAt ? fakeAIAgent.id : null,
		escalationReason: params.escalationReason ?? null,
		escalationHandledAt: params.escalationHandledAt ?? null,
		escalationHandledByUserId: params.escalationHandledAt
			? ANTHONY_RIERA_ID
			: null,
		aiPausedUntil: null,
		createdAt: params.startedAt,
		updatedAt,
		deletedAt: null,
		lastMessageAt: params.lastTimelineItem?.createdAt ?? params.startedAt,
		lastSeenAt: params.lastSeenAt ?? null,
		visitorRating: null,
		visitorRatingAt: null,
		lastMessageTimelineItem: params.lastTimelineItem,
		lastTimelineItem: params.lastTimelineItem,
		activeClarification: params.activeClarification ?? null,
		viewIds: [],
		seenData: [],
	};
};

export const pieterVisitor: FakeVisitor = createFakeVisitor({
	id: PIETER_VISITOR_ID,
	lastSeenAt: minutesAgo(35),
	contact: {
		id: "01JGCON11111111111111111",
		name: "Pieter Levels",
		email: "pieter@nomadlist.com",
		image: null,
	},
	browser: "Chrome",
	browserVersion: "121.0",
	os: "macOS",
	osVersion: "14.3",
	device: "MacBook Pro",
	deviceType: "desktop",
	country: "Thailand",
	countryCode: "TH",
	city: "Chiang Mai",
	region: "Chiang Mai Province",
	timezone: "Asia/Bangkok",
	language: "en-US",
	ip: "123.45.67.89",
	viewport: "1920x1080",
});

const nicoVisitor = createFakeVisitor({
	id: "01JGVIS44444444444444444",
	lastSeenAt: minutesAgo(6),
	contact: {
		id: "01JGCON44444444444444444",
		name: "Nico Jeannen",
		email: "nico@indie.page",
		image: null,
	},
	browser: "Firefox",
	browserVersion: "121.0",
	os: "Windows",
	osVersion: "11",
	device: "Desktop PC",
	deviceType: "desktop",
	country: "France",
	countryCode: "FR",
	city: "Paris",
	region: "Ile-de-France",
	timezone: "Europe/Paris",
	language: "fr-FR",
	ip: "185.23.45.67",
	viewport: "2560x1440",
});

const dannyVisitor = createFakeVisitor({
	id: "01JGVIS55555555555555555",
	lastSeenAt: minutesAgo(12),
	contact: {
		id: "01JGCON55555555555555555",
		name: "Danny Postma",
		email: "danny@landingfolio.com",
		image: null,
	},
	browser: "Safari",
	browserVersion: "17.2",
	os: "macOS",
	osVersion: "14.4",
	device: "MacBook Air",
	deviceType: "desktop",
	country: "Netherlands",
	countryCode: "NL",
	city: "Amsterdam",
	region: "North Holland",
	timezone: "Europe/Amsterdam",
	language: "nl-NL",
	ip: "84.124.78.90",
	viewport: "1728x1117",
});

const tonyVisitor = createFakeVisitor({
	id: "01JGVIS33333333333333333",
	lastSeenAt: hoursAgo(18),
	contact: {
		id: "01JGCON33333333333333333",
		name: "Tony Dinh",
		email: "tony@blackmagic.so",
		image: null,
	},
	browser: "Chrome",
	browserVersion: "121.0",
	os: "macOS",
	osVersion: "14.2",
	device: "MacBook Pro",
	deviceType: "desktop",
	country: "Vietnam",
	countryCode: "VN",
	city: "Ho Chi Minh City",
	region: "Ho Chi Minh",
	timezone: "Asia/Ho_Chi_Minh",
	language: "en-US",
	ip: "98.76.54.32",
	viewport: "1440x900",
});

const sarahVisitor = createFakeVisitor({
	id: "01JGVIS88888888888888888",
	lastSeenAt: minutesAgo(4),
	contact: {
		id: "01JGCON88888888888888888",
		name: "Sarah Dayan",
		email: "sarah@frontend.today",
		image: null,
	},
	browser: "Arc",
	browserVersion: "1.24",
	os: "macOS",
	osVersion: "14.5",
	device: "MacBook Pro",
	deviceType: "desktop",
	country: "United Kingdom",
	countryCode: "GB",
	city: "London",
	region: "England",
	timezone: "Europe/London",
	language: "en-GB",
	ip: "91.76.55.101",
	viewport: "1512x982",
});

const lucasVisitor = createFakeVisitor({
	id: "01JGVIS99999999999999999",
	lastSeenAt: minutesAgo(2),
	contact: {
		id: "01JGCON99999999999999999",
		name: "Lucas Mouilleron",
		email: "lucas@founderops.dev",
		image: null,
	},
	browser: "Chrome",
	browserVersion: "122.0",
	os: "macOS",
	osVersion: "14.4",
	device: "MacBook Pro",
	deviceType: "desktop",
	country: "Canada",
	countryCode: "CA",
	city: "Montreal",
	region: "Quebec",
	timezone: "America/Toronto",
	language: "en-CA",
	ip: "52.14.23.188",
	viewport: "1920x1200",
});

export const marcVisitor: FakeVisitor = createFakeVisitor({
	id: MARC_VISITOR_ID,
	lastSeenAt: minutesAgo(1),
	contact: {
		id: "01JGCON22222222222222222",
		name: "Marc Louvion",
		email: "marc@shipfa.st",
		image: null,
	},
	browser: "Chrome",
	browserVersion: "120.0",
	os: "macOS",
	osVersion: "14.2",
	device: "MacBook Pro",
	deviceType: "desktop",
	country: "France",
	countryCode: "FR",
	city: "Paris",
	region: "Ile-de-France",
	timezone: "Europe/Paris",
	language: "fr-FR",
	ip: "185.67.89.12",
	viewport: "1680x1050",
});

export const createMarcEscalatedConversation = (): ConversationHeader => {
	const startedAt = hoursAgo(3.2);
	const aiEscalationMessageAt = hoursAgo(0.9);

	return createConversation({
		id: MARC_CONVERSATION_ID,
		visitor: marcVisitor,
		title: "Production widget blocked on custom domain",
		priority: "urgent",
		status: ConversationStatus.OPEN,
		startedAt,
		updatedAt: aiEscalationMessageAt,
		escalatedAt: hoursAgo(1.1),
		escalationReason:
			"AI prepared a safe production patch, but a teammate must deploy and verify it.",
		lastTimelineItem: createMessageTimelineItem({
			id: "01JGTIM22222222222222225",
			conversationId: MARC_CONVERSATION_ID,
			text: "I traced this to a stale production allowlist and prepared a safe patch. I need a human teammate to deploy and verify it. Please join the conversation.",
			aiAgentId: fakeAIAgent.id,
			createdAt: aiEscalationMessageAt,
		}),
	});
};

export const createPieterDeleteAccountAnsweredConversation =
	(): ConversationHeader => {
		const startedAt = minutesAgo(22);
		const questionAt = minutesAgo(1);

		return createConversation({
			id: MARC_CONVERSATION_ID,
			visitor: pieterVisitor,
			title: DEMO_DELETE_ACCOUNT_FAQ_TITLE,
			priority: "normal",
			status: ConversationStatus.OPEN,
			startedAt,
			updatedAt: questionAt,
			lastTimelineItem: createMessageTimelineItem({
				id: "01JGVIDEO22222222222222221",
				conversationId: MARC_CONVERSATION_ID,
				text: DEMO_DELETE_ACCOUNT_QUESTION,
				visitorId: PIETER_VISITOR_ID,
				createdAt: questionAt,
			}),
		});
	};

export function getFakeDashboardPrimaryConversation(
	scenario: FakeDashboardScenarioId = "landing_escalation"
): ConversationHeader {
	if (scenario === "promo_delete_account_answered") {
		return createPieterDeleteAccountAnsweredConversation();
	}

	return createMarcEscalatedConversation();
}

export function getFakeDashboardConversations(
	scenario: FakeDashboardScenarioId = "landing_escalation"
): ConversationHeader[] {
	return [
		getFakeDashboardPrimaryConversation(scenario),
		createConversation({
			id: NEEDS_HUMAN_CONVERSATION_ID,
			visitor: nicoVisitor,
			title: "Annual renewal paid but entitlements still on free plan",
			priority: "high",
			status: ConversationStatus.OPEN,
			startedAt: hoursAgo(12),
			updatedAt: hoursAgo(1.9),
			escalatedAt: hoursAgo(2.4),
			escalationReason:
				"AI can reconcile entitlements, but backdated credit approval needs a human decision.",
			lastTimelineItem: createMessageTimelineItem({
				id: "01JGTIM44444444444444444",
				conversationId: NEEDS_HUMAN_CONVERSATION_ID,
				text: "I found a Stripe webhook race and prepared the entitlement fix. A human needs to approve the prorated credit before I apply it.",
				aiAgentId: fakeAIAgent.id,
				createdAt: hoursAgo(1.9),
			}),
		}),
		createConversation({
			id: WAITING_CONVERSATION_ID,
			visitor: pieterVisitor,
			title: "Webhook failures since 02:17 UTC",
			priority: "normal",
			status: ConversationStatus.OPEN,
			startedAt: hoursAgo(14),
			updatedAt: hoursAgo(12.8),
			lastTimelineItem: createMessageTimelineItem({
				id: "01JGTIM11111111111111111",
				conversationId: WAITING_CONVERSATION_ID,
				text: "We're still seeing checkout.completed failures in production. Can you export the failed event IDs so we can reconcile?",
				visitorId: pieterVisitor.id,
				createdAt: hoursAgo(12.8),
			}),
		}),
		createConversation({
			id: OTHER_CONVERSATION_ID,
			visitor: dannyVisitor,
			title: "Staging signature mismatch after secret rotation",
			priority: "normal",
			status: ConversationStatus.OPEN,
			startedAt: hoursAgo(3),
			updatedAt: minutesAgo(26),
			lastSeenAt: minutesAgo(10),
			lastTimelineItem: createMessageTimelineItem({
				id: "01JGTIM55555555555555555",
				conversationId: OTHER_CONVERSATION_ID,
				text: "I rotated the staging signing secret and replayed the last 20 failed events. If you want, I can stage the same runbook for production.",
				aiAgentId: fakeAIAgent.id,
				createdAt: minutesAgo(26),
			}),
		}),
		createConversation({
			id: PIPELINE_TYPING_CONVERSATION_ID,
			visitor: lucasVisitor,
			title: "SAML callback rejected on workspace invite",
			priority: "normal",
			status: ConversationStatus.OPEN,
			startedAt: minutesAgo(52),
			updatedAt: minutesAgo(11),
			lastSeenAt: minutesAgo(11),
			lastTimelineItem: createMessageTimelineItem({
				id: "01JGTIM66666666666666666",
				conversationId: PIPELINE_TYPING_CONVERSATION_ID,
				text: "I found an outdated callback URL in your SSO settings. I can apply the fix after you confirm the new redirect URI.",
				aiAgentId: fakeAIAgent.id,
				createdAt: minutesAgo(11),
			}),
		}),
		createConversation({
			id: OTHER_CONVERSATION_ID_TWO,
			visitor: sarahVisitor,
			title: "Public docs access restored",
			priority: "low",
			status: ConversationStatus.OPEN,
			startedAt: minutesAgo(35),
			updatedAt: minutesAgo(15),
			lastTimelineItem: createMessageTimelineItem({
				id: "01JGTIM77777777777777777",
				conversationId: OTHER_CONVERSATION_ID_TWO,
				text: "Thanks, docs access is fixed. Could you also add rate-limit headers to the API examples?",
				visitorId: sarahVisitor.id,
				createdAt: minutesAgo(15),
			}),
		}),
		createConversation({
			id: RESOLVED_CONVERSATION_ID,
			visitor: tonyVisitor,
			title: "React integration docs",
			priority: "low",
			status: ConversationStatus.RESOLVED,
			startedAt: daysAgo(2),
			updatedAt: daysAgo(2),
			resolvedAt: daysAgo(2),
			resolvedByUserId: ANTHONY_RIERA_ID,
			lastTimelineItem: createMessageTimelineItem({
				id: "01JGTIM33333333333333333",
				conversationId: RESOLVED_CONVERSATION_ID,
				text: "Got it working, thanks for the docs link!",
				visitorId: tonyVisitor.id,
				createdAt: daysAgo(2),
			}),
		}),
	];
}

export const fakeConversations: ConversationHeader[] =
	getFakeDashboardConversations();

export const fakeVisitors: FakeVisitor[] = [
	pieterVisitor,
	nicoVisitor,
	dannyVisitor,
	tonyVisitor,
	sarahVisitor,
	lucasVisitor,
	marcVisitor,
];

export const createMarcConversation = (
	messageText: string,
	timestamp: Date
): ConversationHeader => {
	const createdAt = timestamp.toISOString();

	return createConversation({
		id: MARC_CONVERSATION_ID,
		visitor: marcVisitor,
		title: "Production widget blocked on custom domain",
		priority: "urgent",
		status: ConversationStatus.OPEN,
		startedAt: createdAt,
		updatedAt: createdAt,
		lastTimelineItem: createMessageTimelineItem({
			id: "01JGTIM22222222222222222",
			conversationId: MARC_CONVERSATION_ID,
			text: messageText,
			visitorId: MARC_VISITOR_ID,
			createdAt,
		}),
	});
};
