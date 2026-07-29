import { blockVisitor, unblockVisitor } from "@api/db/mutations/visitor";
import {
	getContactForVisitor,
	mergeContactMetadata,
} from "@api/db/queries/contact";
import { listConversationsHeaders } from "@api/db/queries/conversation";
import type { VisitorRecord } from "@api/db/queries/visitor";
import {
	findVisitorForWebsite,
	updateVisitorForWebsite,
} from "@api/db/queries/visitor";
import { env } from "@api/env";
import { AuthValidationError } from "@api/lib/auth-validation";
import { resolvePrivateApiKeyActorUser } from "@api/lib/private-api-key-actor";
import { trackVisitorActivity, trackVisitorEvent } from "@api/lib/tinybird-sdk";
import {
	flattenVisitorTrackingContext,
	resolveFirstTouchAttribution,
} from "@api/lib/visitor-attribution";
import { realtime } from "@api/realtime/emitter";
import { lookupGeoIp } from "@api/services/geoip";
import { markVisitorPresence } from "@api/services/presence";
import {
	applyDevelopmentClientIpOverride,
	extractClientIpFromRequest,
} from "@api/utils/client-ip";
import { createConversationEvent } from "@api/utils/conversation-event";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import {
	blockVisitorRoute,
	getVisitorActivityRoute,
	getVisitorRoute,
	unblockVisitorRoute,
	updateVisitorMetadataRoute,
	updateVisitorRoute,
} from "@cossistant/protocol/routes";
import {
	ConversationEventType,
	TimelineItemVisibility,
	type UpdateVisitorRequest,
	updateVisitorMetadataRequestSchema,
	updateVisitorRequestSchema,
	type VisitorActivityRequest,
	type VisitorActivityResponse,
	type VisitorResponse,
	visitorActivityRequestSchema,
	visitorActivityResponseSchema,
	visitorResponseSchema,
} from "@cossistant/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { z } from "zod";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import {
	errorJsonResponse,
	privateControlAuth,
	requirePrivateControlContext,
	restError,
	runtimeDualAuth,
} from "../openapi";
import type { RestContext } from "../types";

export const visitorRouter = new OpenAPIHono<RestContext>();
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;
const MAX_PRECISE_GEO_ACCURACY_RADIUS_KM = 100;

type PersistedGeoUpdate = {
	ip?: string;
	city?: string | null;
	region?: string | null;
	country?: string | null;
	countryCode?: string | null;
	latitude?: number | null;
	longitude?: number | null;
	geoSource?: "maxmind" | "edge_header" | null;
	geoAccuracyRadiusKm?: number | null;
	geoResolvedAt?: string | null;
};

function formatVisitorResponse(record: VisitorRecord): VisitorResponse {
	return {
		id: record.id,
		browser: record.browser,
		browserVersion: record.browserVersion,
		os: record.os,
		osVersion: record.osVersion,
		device: record.device,
		deviceType: record.deviceType,
		ip: record.ip,
		city: record.city,
		region: record.region,
		country: record.country,
		countryCode: record.countryCode,
		latitude: record.latitude,
		longitude: record.longitude,
		language: record.language,
		timezone: record.timezone,
		screenResolution: record.screenResolution,
		viewport: record.viewport,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		lastSeenAt: record.lastSeenAt ?? null,
		websiteId: record.websiteId,
		organizationId: record.organizationId,
		blockedAt: record.blockedAt ?? null,
		blockedByUserId: record.blockedByUserId,
		isBlocked: Boolean(record.blockedAt),
		attribution: record.attribution ?? null,
		currentPage: record.currentPage ?? null,
		contact: null,
	};
}

async function resolvePrivateVisitorActor(params: {
	c: Context<RestContext>;
	db: RestContext["Variables"]["db"];
	apiKey: RestContext["Variables"]["apiKey"];
	organizationId: string;
	websiteTeamId: string | null | undefined;
}) {
	if (!params.apiKey) {
		return restError(params.c, 401, "UNAUTHORIZED", "Invalid API key");
	}

	try {
		return await resolvePrivateApiKeyActorUser({
			db: params.db,
			apiKey: params.apiKey,
			organizationId: params.organizationId,
			websiteTeamId: params.websiteTeamId,
			explicitActorUserId: params.c.req.header("X-Actor-User-Id") ?? null,
			required: true,
		});
	} catch (error) {
		if (error instanceof AuthValidationError) {
			const status = error.statusCode === 400 ? 400 : 403;
			return restError(
				params.c,
				status,
				status === 400 ? "BAD_REQUEST" : "FORBIDDEN",
				error.message
			);
		}

		throw error;
	}
}

async function createLatestVisitorModerationEvent(params: {
	db: RestContext["Variables"]["db"];
	organizationId: string;
	websiteId: string;
	visitorId: string;
	actorUserId: string;
	type:
		| typeof ConversationEventType.VISITOR_BLOCKED
		| typeof ConversationEventType.VISITOR_UNBLOCKED;
}) {
	const result = await listConversationsHeaders(params.db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		visitorId: params.visitorId,
		limit: 1,
	});
	const latestConversation = result.items.at(0);

	if (!latestConversation) {
		return;
	}

	await createConversationEvent({
		db: params.db,
		context: {
			conversationId: latestConversation.id,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			visitorId: params.visitorId,
		},
		event: {
			type: params.type,
			actorUserId: params.actorUserId,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});
}

function getHeaderValue(
	request: Context<RestContext>["req"],
	name: string
): string | null {
	return request.header(name) ?? null;
}

function pickFirstHeader(values: Array<string | null>): string | null {
	return values.find((value) => value && value.trim().length > 0) ?? null;
}

function parsePreferredLocale(headerValue: string | null): string | null {
	if (!headerValue) {
		return null;
	}

	return headerValue.split(",").at(0) ?? null;
}

function normalizeCountryCode(code?: string | null): string | null {
	if (!code) {
		return null;
	}

	const trimmed = code.trim();
	if (trimmed.length !== 2) {
		return null;
	}

	const normalizedCode = trimmed.toUpperCase();
	return COUNTRY_CODE_REGEX.test(normalizedCode) ? normalizedCode : null;
}

function parseCoordinate(value: string | null): number | null {
	if (!value) {
		return null;
	}

	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function setIfPresent<T extends keyof UpdateVisitorRequest>(
	target: Partial<UpdateVisitorRequest>,
	key: T,
	value: UpdateVisitorRequest[T] | null | undefined
): void {
	if (value !== null && value !== undefined) {
		target[key] = value;
	}
}

function getCountryDisplayName(
	countryCode: string | null,
	locale: string | null
): string | null {
	if (!countryCode || typeof Intl.DisplayNames === "undefined") {
		return null;
	}

	try {
		const display = new Intl.DisplayNames([locale || "en"], {
			type: "region",
		});
		return display.of(countryCode) ?? null;
	} catch {
		return null;
	}
}

function extractEdgeGeoUpdate(
	request: Context<RestContext>["req"],
	preferredLocale: string | null
): PersistedGeoUpdate {
	const header = (name: string) => getHeaderValue(request, name);
	const city = pickFirstHeader([
		header("cf-ipcity"),
		header("x-vercel-ip-city"),
	]);
	const region = pickFirstHeader([
		header("cf-ipregion"),
		header("x-vercel-ip-country-region"),
	]);
	const countryCode = normalizeCountryCode(
		pickFirstHeader([header("cf-ipcountry"), header("x-vercel-ip-country")])
	);
	const latitude = parseCoordinate(
		pickFirstHeader([
			getHeaderValue(request, "cf-iplatitude"),
			getHeaderValue(request, "x-vercel-ip-latitude"),
		])
	);
	const longitude = parseCoordinate(
		pickFirstHeader([
			getHeaderValue(request, "cf-iplongitude"),
			getHeaderValue(request, "x-vercel-ip-longitude"),
		])
	);

	const edgeUpdate: PersistedGeoUpdate = {};
	if (city) {
		edgeUpdate.city = city;
	}
	if (region) {
		edgeUpdate.region = region;
	}
	if (countryCode) {
		edgeUpdate.countryCode = countryCode;
		const countryName = getCountryDisplayName(countryCode, preferredLocale);
		if (countryName) {
			edgeUpdate.country = countryName;
		}
	}
	if (latitude !== null && longitude !== null) {
		edgeUpdate.latitude = latitude;
		edgeUpdate.longitude = longitude;
	}

	return edgeUpdate;
}

function extractRequestContext(request: Context<RestContext>["req"]): {
	preferredLocale: string | null;
	preferredLanguage: string | null;
	edgeGeoUpdate: PersistedGeoUpdate;
	edgeTimezone: string | null;
	canonicalIp: string | null;
	publicIp: string | null;
} {
	const header = (name: string) => getHeaderValue(request, name);
	const preferredLocale = parsePreferredLocale(header("accept-language"));
	const ipInfo = applyDevelopmentClientIpOverride(
		extractClientIpFromRequest(request),
		{
			nodeEnv: env.NODE_ENV,
			overrideIp: env.LOCAL_VISITOR_IP_OVERRIDE,
			warn: console.warn,
		}
	);

	return {
		preferredLocale,
		preferredLanguage: preferredLocale,
		edgeGeoUpdate: extractEdgeGeoUpdate(request, preferredLocale),
		edgeTimezone: header("x-vercel-ip-timezone"),
		canonicalIp: ipInfo.canonicalIp,
		publicIp: ipInfo.publicIp,
	};
}

function hasPersistedGeo(update: PersistedGeoUpdate): boolean {
	return Boolean(
		update.countryCode ||
			update.country ||
			update.region ||
			update.city ||
			update.latitude !== undefined ||
			update.longitude !== undefined
	);
}

function stripServerOwnedGeoFields(
	body: UpdateVisitorRequest
): Partial<UpdateVisitorRequest> {
	const {
		ip: _ip,
		city: _city,
		region: _region,
		country: _country,
		countryCode: _countryCode,
		latitude: _latitude,
		longitude: _longitude,
		...rest
	} = body;

	return rest;
}

function extractManualGeoFallback(
	body: UpdateVisitorRequest,
	preferredLocale: string | null
): Partial<UpdateVisitorRequest> {
	const manualGeo: Partial<UpdateVisitorRequest> = {};
	setIfPresent(manualGeo, "city", body.city);
	setIfPresent(manualGeo, "region", body.region);
	setIfPresent(manualGeo, "country", body.country);
	setIfPresent(manualGeo, "latitude", body.latitude);
	setIfPresent(manualGeo, "longitude", body.longitude);

	const normalizedBodyCountryCode = normalizeCountryCode(body.countryCode);
	if (normalizedBodyCountryCode) {
		manualGeo.countryCode = normalizedBodyCountryCode;
		if (!manualGeo.country) {
			const countryName = getCountryDisplayName(
				normalizedBodyCountryCode,
				preferredLocale
			);
			if (countryName) {
				manualGeo.country = countryName;
			}
		}
	}

	return manualGeo;
}

async function resolveServerGeoUpdate(params: {
	existingVisitor: VisitorRecord;
	canonicalIp: string | null;
	publicIp: string | null;
	edgeGeoUpdate: PersistedGeoUpdate;
	edgeTimezone: string | null;
	resolvedAt: string;
}): Promise<{
	geoUpdate: PersistedGeoUpdate;
	timezoneFallback: string | null;
}> {
	const geoUpdate: PersistedGeoUpdate = {};
	if (params.canonicalIp) {
		geoUpdate.ip = params.canonicalIp;
	}

	const ipChanged =
		params.canonicalIp !== null &&
		params.canonicalIp !== params.existingVisitor.ip;
	const shouldLookupGeo =
		Boolean(params.publicIp) &&
		(ipChanged ||
			!params.existingVisitor.geoSource ||
			params.existingVisitor.geoSource !== "maxmind");

	if (shouldLookupGeo && params.publicIp) {
		const lookup = await lookupGeoIp(params.publicIp);
		if (lookup?.found) {
			const normalizedLookupCountryCode = normalizeCountryCode(
				lookup.country_code
			);
			const hasLookupGeoPayload = Boolean(
				normalizedLookupCountryCode ||
					lookup.country ||
					lookup.region ||
					lookup.city ||
					lookup.timezone ||
					lookup.latitude !== null ||
					lookup.longitude !== null
			);

			if (hasLookupGeoPayload) {
				if (normalizedLookupCountryCode) {
					geoUpdate.countryCode = normalizedLookupCountryCode;
				}
				if (lookup.country) {
					geoUpdate.country = lookup.country;
				}
				if (lookup.region) {
					geoUpdate.region = lookup.region;
				}
				if (lookup.city) {
					geoUpdate.city = lookup.city;
				}

				const shouldPersistPreciseCoordinates =
					lookup.accuracy_radius_km !== null &&
					lookup.accuracy_radius_km <= MAX_PRECISE_GEO_ACCURACY_RADIUS_KM &&
					lookup.latitude !== null &&
					lookup.longitude !== null;
				geoUpdate.latitude = shouldPersistPreciseCoordinates
					? lookup.latitude
					: null;
				geoUpdate.longitude = shouldPersistPreciseCoordinates
					? lookup.longitude
					: null;
				geoUpdate.geoSource = "maxmind";
				geoUpdate.geoAccuracyRadiusKm = lookup.accuracy_radius_km;
				geoUpdate.geoResolvedAt = lookup.resolved_at;

				return {
					geoUpdate,
					timezoneFallback: lookup.timezone ?? params.edgeTimezone,
				};
			}
		}
	}

	if (hasPersistedGeo(params.edgeGeoUpdate)) {
		return {
			geoUpdate: {
				...geoUpdate,
				...params.edgeGeoUpdate,
				geoSource: "edge_header",
				geoAccuracyRadiusKm: null,
				geoResolvedAt: params.resolvedAt,
			},
			timezoneFallback: params.edgeTimezone,
		};
	}

	if (ipChanged) {
		return {
			geoUpdate: {
				...geoUpdate,
				city: null,
				region: null,
				country: null,
				countryCode: null,
				latitude: null,
				longitude: null,
				geoSource: null,
				geoAccuracyRadiusKm: null,
				geoResolvedAt: null,
			},
			timezoneFallback: params.edgeTimezone,
		};
	}

	return {
		geoUpdate,
		timezoneFallback: params.edgeTimezone,
	};
}

function toOptionalNumber(
	value: number | null | undefined
): number | undefined {
	if (value === null || value === undefined) {
		return;
	}

	return value;
}

function toOptionalString(
	value: string | null | undefined
): string | undefined {
	if (value === null || value === undefined) {
		return;
	}

	return value;
}

visitorRouter.use("/*", ...protectedPublicApiKeyMiddleware);

// POST /visitors/:id/activity - Track live visitor activity
visitorRouter.openapi(getVisitorActivityRoute, async (c) => {
	try {
		const { body, db, website } = await safelyExtractRequestData(
			c,
			visitorActivityRequestSchema
		);
		const visitorId = c.req.param("id");

		if (!visitorId) {
			return c.json(
				{
					error: "BAD_REQUEST",
					message: "Visitor ID is required",
				},
				400
			);
		}

		const visitor = await findVisitorForWebsite(db, {
			visitorId,
			websiteId: website.id,
		});

		if (!visitor) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		const acceptedAt = new Date().toISOString();
		const updatedVisitor = await updateVisitorForWebsite(db, {
			visitorId,
			websiteId: website.id,
			data: {
				lastSeenAt: acceptedAt,
				updatedAt: acceptedAt,
			},
		});
		const trackingContext = flattenVisitorTrackingContext({
			attribution: body.attribution,
			currentPage: body.currentPage,
		});
		void updatedVisitor;

		trackVisitorActivity({
			website_id: website.id,
			visitor_id: visitorId,
			session_id: body.sessionId,
			event_type: body.activityType,
			city: toOptionalString(visitor.city),
			country_code: toOptionalString(visitor.countryCode),
			latitude: toOptionalNumber(visitor.latitude),
			longitude: toOptionalNumber(visitor.longitude),
			...trackingContext,
		});

		await markVisitorPresence({
			websiteId: website.id,
			visitorId,
			lastSeenAt: acceptedAt,
			geo: {
				city: toOptionalString(visitor.city),
				countryCode: toOptionalString(visitor.countryCode),
				latitude: toOptionalNumber(visitor.latitude),
				longitude: toOptionalNumber(visitor.longitude),
			},
		});

		void realtime
			.emit("visitorPresenceUpdate", {
				activityType: body.activityType,
				attribution: body.attribution,
				currentPage: body.currentPage,
				organizationId: visitor.organizationId,
				sessionId: body.sessionId,
				userId: null,
				visitorId,
				websiteId: website.id,
			})
			.catch((error) => {
				console.error("[VisitorActivity] Failed to publish realtime event", {
					websiteId: website.id,
					visitorId,
					error,
				});
			});

		const response: VisitorActivityResponse = {
			ok: true,
			acceptedAt,
		};

		return c.json(
			validateResponse(response, visitorActivityResponseSchema),
			200
		);
	} catch (error) {
		console.error("Error tracking visitor activity:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to track visitor activity",
			},
			500
		);
	}
});

// PATCH /visitors/:id - Update existing visitor information
visitorRouter.openapi(updateVisitorRoute, async (c) => {
	try {
		const { db, website, body } = await safelyExtractRequestData(
			c,
			updateVisitorRequestSchema
		);
		const visitorId = c.req.param("id");

		if (!visitorId) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		if (!website?.id) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const existingVisitor = await findVisitorForWebsite(db, {
			visitorId,
			websiteId: website.id,
		});

		if (!existingVisitor) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		const normalizedBodyCountryCode = normalizeCountryCode(body.countryCode);
		if (
			typeof body.countryCode === "string" &&
			normalizedBodyCountryCode === null
		) {
			return c.json(
				{
					error: "BAD_REQUEST",
					message: "countryCode must be a valid ISO 3166-1 alpha-2 code",
				},
				400
			);
		}

		const normalizedBody: UpdateVisitorRequest = {
			...body,
			...(normalizedBodyCountryCode
				? { countryCode: normalizedBodyCountryCode }
				: {}),
			attribution: body.attribution,
			currentPage: body.currentPage,
		};

		const now = new Date();
		const nowIso = now.toISOString();
		const requestContext = extractRequestContext(c.req);
		const { geoUpdate, timezoneFallback } = await resolveServerGeoUpdate({
			existingVisitor,
			canonicalIp: requestContext.canonicalIp,
			publicIp: requestContext.publicIp,
			edgeGeoUpdate: requestContext.edgeGeoUpdate,
			edgeTimezone: requestContext.edgeTimezone,
			resolvedAt: nowIso,
		});

		const baseVisitorUpdate = stripServerOwnedGeoFields(normalizedBody);
		if (
			baseVisitorUpdate.language === undefined &&
			requestContext.preferredLanguage
		) {
			baseVisitorUpdate.language = requestContext.preferredLanguage;
		}
		if (baseVisitorUpdate.timezone === undefined && timezoneFallback) {
			baseVisitorUpdate.timezone = timezoneFallback;
		}

		const manualGeoFallback =
			requestContext.canonicalIp === null
				? extractManualGeoFallback(
						normalizedBody,
						requestContext.preferredLocale
					)
				: {};

		const updatedVisitor = await updateVisitorForWebsite(db, {
			visitorId,
			websiteId: website.id,
			data: {
				...baseVisitorUpdate,
				...manualGeoFallback,
				...geoUpdate,
				attribution: resolveFirstTouchAttribution({
					existingAttribution: existingVisitor.attribution,
					incomingAttribution: normalizedBody.attribution,
				}),
				currentPage: normalizedBody.currentPage ?? existingVisitor.currentPage,
				lastSeenAt: nowIso,
				updatedAt: nowIso,
			},
		});

		if (!updatedVisitor) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		if (normalizedBody.currentPage) {
			const trackingContext = flattenVisitorTrackingContext({
				attribution: updatedVisitor.attribution,
				currentPage: updatedVisitor.currentPage,
			});

			trackVisitorEvent({
				website_id: website.id,
				visitor_id: visitorId,
				event_type: "page_view",
				...trackingContext,
			});

			trackVisitorActivity({
				website_id: website.id,
				visitor_id: visitorId,
				event_type: "page_sync",
				session_id: visitorId,
				city: updatedVisitor.city ?? undefined,
				country_code: updatedVisitor.countryCode ?? undefined,
				latitude: updatedVisitor.latitude ?? undefined,
				longitude: updatedVisitor.longitude ?? undefined,
				...trackingContext,
			});
		}

		const response = formatVisitorResponse(updatedVisitor);

		return c.json(validateResponse(response, visitorResponseSchema), 200);
	} catch (error) {
		console.error("Error updating visitor:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to update visitor information",
			},
			500
		);
	}
});

// PATCH /visitors/:id/metadata - Update contact metadata for a visitor
visitorRouter.openapi(updateVisitorMetadataRoute, async (c) => {
	try {
		const { db, website, body } = await safelyExtractRequestData(
			c,
			updateVisitorMetadataRequestSchema
		);
		const visitorId = c.req.param("id");

		if (!visitorId) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		if (!website?.id) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const contact = await getContactForVisitor(db, {
			visitorId,
			websiteId: website.id,
		});

		if (!contact) {
			return c.json(
				{
					error: "BAD_REQUEST",
					message:
						"Visitor is not identified. Please use the /contacts/identify endpoint first to create a contact for this visitor.",
				},
				400
			);
		}

		await mergeContactMetadata(db, {
			contactId: contact.id,
			websiteId: website.id,
			metadata: body.metadata,
		});

		const visitor = await findVisitorForWebsite(db, {
			visitorId,
			websiteId: website.id,
		});

		if (!visitor) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		const response = formatVisitorResponse(visitor);

		return c.json(validateResponse(response, visitorResponseSchema), 200);
	} catch (error) {
		console.error("Error updating contact metadata:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to update contact metadata",
			},
			500
		);
	}
});

visitorRouter.openapi(blockVisitorRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);

		if (privateContext instanceof Response) {
			return privateContext;
		}

		const visitorId = c.req.param("id");
		if (!visitorId) {
			return restError(c, 404, "NOT_FOUND", "Visitor not found");
		}

		const actor = await resolvePrivateVisitorActor({
			c,
			db: extracted.db,
			apiKey: privateContext.apiKey,
			organizationId: privateContext.organization.id,
			websiteTeamId: privateContext.website.teamId,
		});

		if (actor instanceof Response) {
			return actor;
		}
		if (!actor) {
			return restError(c, 400, "BAD_REQUEST", "Actor user is required");
		}

		const visitorRecord = await findVisitorForWebsite(extracted.db, {
			visitorId,
			websiteId: privateContext.website.id,
		});

		if (!visitorRecord) {
			return restError(c, 404, "NOT_FOUND", "Visitor not found");
		}

		const updatedVisitor = await blockVisitor(extracted.db, {
			visitor: visitorRecord,
			actorUserId: actor.userId,
		});

		if (!updatedVisitor) {
			return restError(
				c,
				500,
				"INTERNAL_SERVER_ERROR",
				"Unable to block visitor"
			);
		}

		await createLatestVisitorModerationEvent({
			db: extracted.db,
			organizationId: privateContext.organization.id,
			websiteId: privateContext.website.id,
			visitorId,
			actorUserId: actor.userId,
			type: ConversationEventType.VISITOR_BLOCKED,
		});

		return c.json(
			validateResponse(
				formatVisitorResponse(updatedVisitor),
				visitorResponseSchema
			),
			200
		);
	} catch (error) {
		console.error("Error blocking visitor:", error);
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Failed to block visitor"
		);
	}
});

visitorRouter.openapi(unblockVisitorRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);

		if (privateContext instanceof Response) {
			return privateContext;
		}

		const visitorId = c.req.param("id");
		if (!visitorId) {
			return restError(c, 404, "NOT_FOUND", "Visitor not found");
		}

		const actor = await resolvePrivateVisitorActor({
			c,
			db: extracted.db,
			apiKey: privateContext.apiKey,
			organizationId: privateContext.organization.id,
			websiteTeamId: privateContext.website.teamId,
		});

		if (actor instanceof Response) {
			return actor;
		}
		if (!actor) {
			return restError(c, 400, "BAD_REQUEST", "Actor user is required");
		}

		const visitorRecord = await findVisitorForWebsite(extracted.db, {
			visitorId,
			websiteId: privateContext.website.id,
		});

		if (!visitorRecord) {
			return restError(c, 404, "NOT_FOUND", "Visitor not found");
		}

		const updatedVisitor = await unblockVisitor(extracted.db, {
			visitor: visitorRecord,
			actorUserId: actor.userId,
		});

		if (!updatedVisitor) {
			return restError(
				c,
				500,
				"INTERNAL_SERVER_ERROR",
				"Unable to unblock visitor"
			);
		}

		await createLatestVisitorModerationEvent({
			db: extracted.db,
			organizationId: privateContext.organization.id,
			websiteId: privateContext.website.id,
			visitorId,
			actorUserId: actor.userId,
			type: ConversationEventType.VISITOR_UNBLOCKED,
		});

		return c.json(
			validateResponse(
				formatVisitorResponse(updatedVisitor),
				visitorResponseSchema
			),
			200
		);
	} catch (error) {
		console.error("Error unblocking visitor:", error);
		return restError(
			c,
			500,
			"INTERNAL_SERVER_ERROR",
			"Failed to unblock visitor"
		);
	}
});

// GET /visitors/:id - Get visitor information by ID
visitorRouter.openapi(getVisitorRoute, async (c) => {
	try {
		const { db, website } = await safelyExtractRequestData(c);
		const visitorId = c.req.param("id");

		if (!visitorId) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		if (!website?.id) {
			return c.json({ error: "UNAUTHORIZED", message: "Invalid API key" }, 401);
		}

		const visitorRecord = await findVisitorForWebsite(db, {
			visitorId,
			websiteId: website.id,
		});

		if (!visitorRecord) {
			return c.json({ error: "NOT_FOUND", message: "Visitor not found" }, 404);
		}

		const response = formatVisitorResponse(visitorRecord);

		return c.json(validateResponse(response, visitorResponseSchema), 200);
	} catch (error) {
		console.error("Error fetching visitor:", error);
		return c.json(
			{
				error: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch visitor information",
			},
			500
		);
	}
});
