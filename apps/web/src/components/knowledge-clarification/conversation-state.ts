import type {
	ConversationClarificationSummary,
	KnowledgeClarificationRequest,
} from "@plasma/types";

export type ConversationClarificationDisplayState = {
	engagedRequestId: string | null;
	showPrompt: boolean;
	showAction: boolean;
	actionRequest: KnowledgeClarificationRequest | null;
	showDraftBanner: boolean;
	bannerRequest: KnowledgeClarificationRequest | null;
};

export function resolveEngagedConversationClarificationRequestId(params: {
	summary: ConversationClarificationSummary | null | undefined;
	engagedRequestId: string | null;
}): string | null {
	if (!params.summary) {
		return null;
	}

	if (!params.engagedRequestId) {
		return null;
	}

	if (params.summary.engagementMode === "linked") {
		return null;
	}

	if (params.summary.status === "draft_ready") {
		return null;
	}

	return params.engagedRequestId === params.summary.requestId
		? params.engagedRequestId
		: null;
}

export function shouldShowConversationClarificationPrompt(params: {
	summary: ConversationClarificationSummary | null | undefined;
	engagedRequestId: string | null;
	hasLimitAction: boolean;
}): boolean {
	if (params.hasLimitAction) {
		return false;
	}

	if (!params.summary) {
		return false;
	}

	if (params.summary.engagementMode === "linked") {
		return true;
	}

	if (params.summary.status !== "retry_required" && !params.summary.question) {
		return false;
	}

	return params.engagedRequestId !== params.summary.requestId;
}

export function shouldShowConversationClarificationAction(params: {
	summary: ConversationClarificationSummary | null | undefined;
	engagedRequestId: string | null;
}): boolean {
	if (params.summary?.engagementMode === "linked") {
		return false;
	}

	if (
		!(
			params.summary &&
			params.engagedRequestId &&
			params.summary.status !== "draft_ready"
		)
	) {
		return false;
	}

	return params.summary.requestId === params.engagedRequestId;
}

export function resolveConversationClarificationDisplayState(params: {
	summary: ConversationClarificationSummary | null | undefined;
	request: KnowledgeClarificationRequest | null | undefined;
	engagedRequestId: string | null;
	hasEscalation: boolean;
	hasLimitAction: boolean;
}): ConversationClarificationDisplayState {
	const engagedRequestId = resolveEngagedConversationClarificationRequestId({
		summary: params.summary,
		engagedRequestId: params.engagedRequestId,
	});
	const showAction =
		!params.hasLimitAction &&
		shouldShowConversationClarificationAction({
			summary: params.summary,
			engagedRequestId,
		});
	const showDraftBanner = Boolean(
		!(
			params.hasLimitAction ||
			params.summary?.status !== "draft_ready" ||
			params.summary?.engagementMode === "linked"
		)
	);
	const showPrompt = shouldShowConversationClarificationPrompt({
		summary: params.summary,
		engagedRequestId,
		hasLimitAction: params.hasLimitAction,
	});

	return {
		engagedRequestId,
		showPrompt,
		showAction,
		actionRequest: showAction ? (params.request ?? null) : null,
		showDraftBanner,
		bannerRequest: showDraftBanner ? (params.request ?? null) : null,
	};
}
