import type { Database } from "@api/db";
import {
	getConversationHeader,
	getConversationTimelineItems,
	listConversationsHeaders,
} from "@api/db/queries/conversation";
import { listFeedback } from "@api/db/queries/feedback";
import type { WebsiteSelect } from "@api/db/schema";
import {
	applyDashboardConversationHardLimit,
	getDashboardConversationLockCutoff,
	resolveDashboardHardLimitPolicy,
} from "@api/lib/hard-limits/dashboard";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { formatFeedbackResponse } from "@api/rest/routers/feedback-shared";
import {
	type ConversationContextRequest,
	type ConversationContextResponse,
	conversationContextResponseSchema,
	conversationInboxItemSchema,
	type ListInboxConversationsRequest,
	type ListInboxConversationsResponse,
	listInboxConversationsResponseSchema,
} from "@cossistant/types";
import { SupportCapabilityError } from "./errors";
import {
	resolveSupportWebsiteScope,
	type SupportWebsiteSelector,
} from "./website-scope";

type SupportConversationScope = Partial<SupportWebsiteSelector> & {
	userId?: string;
	website?: WebsiteSelect;
	actorUserId?: string | null;
};

async function getWebsiteScope(db: Database, params: SupportConversationScope) {
	if (params.website) {
		return params.website;
	}

	if (!params.userId) {
		throw new SupportCapabilityError(
			401,
			"UNAUTHORIZED",
			"Signed-in user is required"
		);
	}

	return resolveSupportWebsiteScope(db, {
		userId: params.userId,
		websiteId: params.websiteId,
		websiteName: params.websiteName,
	});
}

export async function listSupportConversations(
	db: Database,
	params: SupportConversationScope & ListInboxConversationsRequest
): Promise<ListInboxConversationsResponse> {
	const site = await getWebsiteScope(db, params);
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

	const [planInfo, result] = await Promise.all([
		getPlanForWebsite(site),
		listConversationsHeaders(db, {
			organizationId: site.organizationId,
			websiteId: site.id,
			userId: params.actorUserId ?? params.userId ?? null,
			limit,
			cursor: params.cursor ?? null,
			status: params.status,
			priority: params.priority,
			sentiment: params.sentiment,
			visitorId: params.visitorId,
			contactId: params.contactId,
			assignedToUserId: params.assignedToUserId,
			viewId: params.viewId,
			createdAtFrom: params.createdAtFrom,
			createdAtTo: params.createdAtTo,
			updatedAtFrom: params.updatedAtFrom,
			updatedAtTo: params.updatedAtTo,
			q: params.q,
			orderBy: params.orderBy,
			order: params.order,
		}),
	]);

	const hardLimitPolicy = resolveDashboardHardLimitPolicy(planInfo);
	const lockCutoff = await getDashboardConversationLockCutoff(db, {
		websiteId: site.id,
		organizationId: site.organizationId,
		policy: hardLimitPolicy,
	});
	const response = {
		items: result.items.map((item) =>
			conversationInboxItemSchema.parse(
				applyDashboardConversationHardLimit({
					conversation: item,
					policy: hardLimitPolicy,
					cutoff: lockCutoff,
				})
			)
		),
		nextCursor: result.nextCursor,
	};

	return listInboxConversationsResponseSchema.parse(response);
}

export async function getSupportConversation(
	db: Database,
	params: SupportConversationScope &
		ConversationContextRequest & {
			conversationId: string;
		}
): Promise<ConversationContextResponse> {
	const site = await getWebsiteScope(db, params);
	const timelineLimit = Math.min(Math.max(params.timelineLimit ?? 50, 1), 100);
	const feedbackLimit = Math.min(Math.max(params.feedbackLimit ?? 20, 1), 100);

	const [conversationHeader, timeline, feedbackResult] = await Promise.all([
		getConversationHeader(db, {
			organizationId: site.organizationId,
			websiteId: site.id,
			conversationId: params.conversationId,
			userId: params.actorUserId ?? params.userId ?? null,
		}),
		getConversationTimelineItems(db, {
			organizationId: site.organizationId,
			websiteId: site.id,
			conversationId: params.conversationId,
			limit: timelineLimit,
			cursor: params.timelineCursor ?? null,
		}),
		listFeedback(db, {
			organizationId: site.organizationId,
			websiteId: site.id,
			conversationId: params.conversationId,
			page: 1,
			limit: feedbackLimit,
			order: "desc",
		}),
	]);

	if (!conversationHeader) {
		throw new SupportCapabilityError(
			404,
			"NOT_FOUND",
			"Conversation not found"
		);
	}

	const conversationContext =
		conversationInboxItemSchema.parse(conversationHeader);
	const response = {
		conversation: conversationContext,
		visitor: conversationContext.visitor,
		timeline: {
			items: timeline.items,
			nextCursor: timeline.nextCursor ?? null,
			hasNextPage: timeline.hasNextPage,
		},
		feedback: feedbackResult.items.map(formatFeedbackResponse),
	};

	return conversationContextResponseSchema.parse(response);
}
