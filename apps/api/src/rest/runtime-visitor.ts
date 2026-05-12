import type { Database } from "@api/db";
import {
	type ActiveVisitorRecord,
	getActiveVisitorForWebsite,
} from "@api/db/queries/conversation-access";
import { APIKeyType } from "@cossistant/types";
import type { Context } from "hono";
import { restError } from "./openapi";
import type { RestContext } from "./types";

function normalizeVisitorId(value: string | null | undefined): string | null {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

export async function resolveRuntimeVisitorIdentity(params: {
	c: Context<RestContext>;
	db: Database;
	apiKey?: RestContext["Variables"]["apiKey"] | null;
	organizationId: string;
	websiteId: string;
	headerVisitorId: string | null | undefined;
	requestVisitorId?: string | null;
	publicOnly?: boolean;
	required?: boolean;
}) {
	const isPublic = params.apiKey?.keyType === APIKeyType.PUBLIC;

	if (params.publicOnly && !isPublic) {
		return {
			visitor: null,
			error: null,
		} satisfies {
			visitor: ActiveVisitorRecord | null;
			error: Response | null;
		};
	}

	const headerVisitorId = normalizeVisitorId(params.headerVisitorId);
	const requestVisitorId = normalizeVisitorId(params.requestVisitorId);

	if (
		headerVisitorId &&
		requestVisitorId &&
		headerVisitorId !== requestVisitorId
	) {
		return {
			visitor: null,
			error: restError(
				params.c,
				400,
				"BAD_REQUEST",
				"Visitor ID mismatch between request and X-Visitor-Id header"
			),
		};
	}

	const visitorId = requestVisitorId ?? headerVisitorId;

	if (!visitorId) {
		if (params.required === false) {
			return {
				visitor: null,
				error: null,
			};
		}

		return {
			visitor: null,
			error: restError(
				params.c,
				400,
				"BAD_REQUEST",
				"Visitor not found, please pass a valid visitorId"
			),
		};
	}

	const visitor = await getActiveVisitorForWebsite(params.db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		visitorId,
	});

	if (!visitor) {
		return {
			visitor: null,
			error: restError(
				params.c,
				400,
				"BAD_REQUEST",
				"Visitor not found, please pass a valid visitorId"
			),
		};
	}

	return {
		visitor,
		error: null,
	};
}
