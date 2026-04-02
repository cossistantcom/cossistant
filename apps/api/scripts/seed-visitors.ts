#!/usr/bin/env bun

import { ConversationStatus } from "@plasma/types";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { getConversationHeader } from "../src/db/queries/conversation";
import { upsertVisitor } from "../src/db/queries/visitor";
import { conversation, website } from "../src/db/schema";
import { ingestEvent, type PresenceEvent } from "../src/lib/tinybird-sdk";
import { emitConversationCreatedEvent } from "../src/utils/conversation-realtime";
import { generateShortPrimaryId, generateULID } from "../src/utils/db/ids";
import { createMessageTimelineItem } from "../src/utils/timeline-item";

const DEFAULT_COUNT = 10;

type GeoSeed = {
	city: string;
	region: string;
	country: string;
	countryCode: string;
	latitude: number;
	longitude: number;
	timezone: string;
};

type MessageSeed = {
	title: string;
	message: string;
};

type DeviceSeed = {
	browser: string;
	browserVersion: string;
	os: string;
	osVersion: string;
	device: string;
	deviceType: string;
	language: string;
	screenResolution: string;
	viewport: string;
};

const GEO_SEEDS: readonly GeoSeed[] = [
	{
		city: "San Francisco",
		region: "California",
		country: "United States",
		countryCode: "US",
		latitude: 37.7749,
		longitude: -122.4194,
		timezone: "America/Los_Angeles",
	},
	{
		city: "Austin",
		region: "Texas",
		country: "United States",
		countryCode: "US",
		latitude: 30.2672,
		longitude: -97.7431,
		timezone: "America/Chicago",
	},
	{
		city: "Toronto",
		region: "Ontario",
		country: "Canada",
		countryCode: "CA",
		latitude: 43.6532,
		longitude: -79.3832,
		timezone: "America/Toronto",
	},
	{
		city: "Berlin",
		region: "Berlin",
		country: "Germany",
		countryCode: "DE",
		latitude: 52.52,
		longitude: 13.405,
		timezone: "Europe/Berlin",
	},
	{
		city: "Paris",
		region: "Ile-de-France",
		country: "France",
		countryCode: "FR",
		latitude: 48.8566,
		longitude: 2.3522,
		timezone: "Europe/Paris",
	},
	{
		city: "Singapore",
		region: "Singapore",
		country: "Singapore",
		countryCode: "SG",
		latitude: 1.3521,
		longitude: 103.8198,
		timezone: "Asia/Singapore",
	},
	{
		city: "Sydney",
		region: "New South Wales",
		country: "Australia",
		countryCode: "AU",
		latitude: -33.8688,
		longitude: 151.2093,
		timezone: "Australia/Sydney",
	},
	{
		city: "Sao Paulo",
		region: "Sao Paulo",
		country: "Brazil",
		countryCode: "BR",
		latitude: -23.5505,
		longitude: -46.6333,
		timezone: "America/Sao_Paulo",
	},
] as const;

const MESSAGE_SEEDS: readonly MessageSeed[] = [
	{
		title: "Need pricing details",
		message:
			"Hey, I am comparing a few tools and want to understand what is included on the paid plan.",
	},
	{
		title: "Quick setup question",
		message:
			"I just installed the widget and want to make sure I configured the website slug correctly.",
	},
	{
		title: "Team access question",
		message:
			"Can I invite another teammate without changing the current setup for existing conversations?",
	},
	{
		title: "Looking for docs",
		message:
			"Where should I start if I want to connect this to our existing support workflow?",
	},
	{
		title: "Testing the inbox",
		message:
			"I am sending a test message to see how fast new conversations show up in the dashboard.",
	},
	{
		title: "Checking integrations",
		message:
			"Does this work well if we want to keep the widget on multiple pages with the same website config?",
	},
] as const;

const DEVICE_SEEDS: readonly DeviceSeed[] = [
	{
		browser: "Chrome",
		browserVersion: "134.0.0.0",
		os: "macOS",
		osVersion: "15.3",
		device: "MacBook Pro",
		deviceType: "desktop",
		language: "en-US",
		screenResolution: "1728x1117",
		viewport: "1440x900",
	},
	{
		browser: "Safari",
		browserVersion: "18.3",
		os: "iOS",
		osVersion: "18.3",
		device: "iPhone",
		deviceType: "mobile",
		language: "en-US",
		screenResolution: "1179x2556",
		viewport: "393x852",
	},
	{
		browser: "Firefox",
		browserVersion: "136.0",
		os: "Windows",
		osVersion: "11",
		device: "ThinkPad",
		deviceType: "desktop",
		language: "en-GB",
		screenResolution: "1920x1080",
		viewport: "1365x768",
	},
	{
		browser: "Edge",
		browserVersion: "134.0.0.0",
		os: "Windows",
		osVersion: "11",
		device: "Surface",
		deviceType: "desktop",
		language: "en-CA",
		screenResolution: "2736x1824",
		viewport: "1368x912",
	},
	{
		browser: "Chrome",
		browserVersion: "134.0.0.0",
		os: "Android",
		osVersion: "15",
		device: "Pixel",
		deviceType: "mobile",
		language: "en-AU",
		screenResolution: "1080x2400",
		viewport: "412x915",
	},
] as const;

function usage(): string {
	return "Usage: bun run db:seed:visitors <website-slug> [count]";
}

function parseArgs(argv: string[]) {
	const websiteSlug = argv[0]?.trim();
	if (!websiteSlug) {
		throw new Error(`Missing website slug.\n${usage()}`);
	}

	const rawCount = argv[1];
	if (rawCount == null) {
		return {
			websiteSlug,
			count: DEFAULT_COUNT,
		};
	}

	const count = Number.parseInt(rawCount, 10);
	if (!Number.isInteger(count) || count <= 0) {
		throw new Error(
			`Invalid count "${rawCount}". Count must be a positive integer.`
		);
	}

	return {
		websiteSlug,
		count,
	};
}

function pickRandom<T>(items: readonly T[]): T {
	const index = Math.floor(Math.random() * items.length);
	const item = items[index];
	if (!item) {
		throw new Error("Cannot pick from an empty list");
	}
	return item;
}

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomIPv4(): string {
	return [
		randomInt(11, 223),
		randomInt(0, 255),
		randomInt(0, 255),
		randomInt(1, 254),
	].join(".");
}

function buildPresenceEvent(params: {
	websiteId: string;
	visitorId: string;
	geo: GeoSeed;
}): PresenceEvent {
	return {
		timestamp: new Date(),
		website_id: params.websiteId,
		entity_id: params.visitorId,
		entity_type: "visitor",
		name: "",
		image: "",
		country_code: params.geo.countryCode,
		city: params.geo.city,
		latitude: params.geo.latitude,
		longitude: params.geo.longitude,
	};
}

async function getWebsiteBySlug(websiteSlug: string) {
	const [site] = await db
		.select({
			id: website.id,
			organizationId: website.organizationId,
			slug: website.slug,
		})
		.from(website)
		.where(and(eq(website.slug, websiteSlug), isNull(website.deletedAt)))
		.limit(1);

	return site ?? null;
}

async function seedVisitorConversation(params: {
	websiteId: string;
	organizationId: string;
}) {
	const visitorId = generateULID();
	const conversationId = generateShortPrimaryId();
	const geo = pickRandom(GEO_SEEDS);
	const messageSeed = pickRandom(MESSAGE_SEEDS);
	const device = pickRandom(DEVICE_SEEDS);
	const createdAt = new Date();

	await upsertVisitor(db, {
		websiteId: params.websiteId,
		organizationId: params.organizationId,
		visitorId,
		visitorData: {
			browser: device.browser,
			browserVersion: device.browserVersion,
			os: device.os,
			osVersion: device.osVersion,
			device: device.device,
			deviceType: device.deviceType,
			language: device.language,
			timezone: geo.timezone,
			screenResolution: device.screenResolution,
			viewport: device.viewport,
			ip: randomIPv4(),
			city: geo.city,
			region: geo.region,
			country: geo.country,
			countryCode: geo.countryCode,
			latitude: geo.latitude,
			longitude: geo.longitude,
		},
	});

	const [conversationRecord] = await db
		.insert(conversation)
		.values({
			id: conversationId,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			visitorId,
			status: ConversationStatus.OPEN,
			channel: "widget",
			title: messageSeed.title,
			titleSource: "user",
			startedAt: createdAt.toISOString(),
			createdAt: createdAt.toISOString(),
			updatedAt: createdAt.toISOString(),
		})
		.returning();

	if (!conversationRecord) {
		throw new Error(`Failed to create conversation ${conversationId}`);
	}

	await createMessageTimelineItem({
		db,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		conversationId,
		conversationOwnerVisitorId: visitorId,
		text: messageSeed.message,
		visitorId,
		createdAt,
	});

	const header = await getConversationHeader(db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		conversationId,
		userId: null,
	});

	if (!header) {
		throw new Error(`Failed to load conversation header for ${conversationId}`);
	}

	await emitConversationCreatedEvent({
		conversation: conversationRecord,
		header,
	});

	await ingestEvent(
		"presence_events",
		buildPresenceEvent({
			websiteId: params.websiteId,
			visitorId,
			geo,
		})
	);

	return {
		visitorId,
		conversationId,
		title: messageSeed.title,
	};
}

async function main() {
	let parsedArgs: ReturnType<typeof parseArgs>;

	try {
		parsedArgs = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(
			`[seed-visitors] ${error instanceof Error ? error.message : "Invalid arguments"}`
		);
		process.exit(1);
		return;
	}

	const site = await getWebsiteBySlug(parsedArgs.websiteSlug);
	if (!site) {
		console.error(
			`[seed-visitors] Website not found for slug "${parsedArgs.websiteSlug}"`
		);
		process.exit(1);
		return;
	}

	let created = 0;
	let failed = 0;

	for (let index = 0; index < parsedArgs.count; index++) {
		try {
			const result = await seedVisitorConversation({
				websiteId: site.id,
				organizationId: site.organizationId,
			});
			created += 1;
			console.log("[seed-visitors] created", {
				index: index + 1,
				visitorId: result.visitorId,
				conversationId: result.conversationId,
				title: result.title,
			});
		} catch (error) {
			failed += 1;
			console.error("[seed-visitors] failed", {
				index: index + 1,
				error: error instanceof Error ? error.message : error,
			});
		}
	}

	const summary = {
		websiteSlug: site.slug,
		websiteId: site.id,
		requested: parsedArgs.count,
		created,
		failed,
	};

	if (failed > 0) {
		console.error("[seed-visitors] completed with failures", summary);
		process.exit(1);
		return;
	}

	console.log("[seed-visitors] done", summary);
	process.exit(0);
}

void main();
