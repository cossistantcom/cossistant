"use client";

import type { ConversationClarificationProgress } from "@plasma/types";

export type LocalClarificationProgressPhase =
	| "saving_answer"
	| "reviewing_known_info"
	| "deciding_next_question"
	| "preparing_next_step";

export type LocalClarificationProgress = {
	phase: LocalClarificationProgressPhase;
	label: string;
	detail: string | null;
	attempt: number | null;
	toolName: string | null;
	startedAt: string;
};

export type ClarificationProgressView =
	| ConversationClarificationProgress
	| LocalClarificationProgress;

export const CLARIFICATION_PROGRESS_REVIEW_DELAY_MS = 800;
export const CLARIFICATION_PROGRESS_DECISION_DELAY_MS = 2200;
export const CLARIFICATION_PROGRESS_PREPARING_DELAY_MS = 4200;
export const CLARIFICATION_PROGRESS_SLOW_WARNING_MS = 18_000;
export const DEFAULT_CLARIFICATION_PROGRESS_FALLBACK_LABEL =
	"Preparing the next step...";

export function createOptimisticClarificationProgress(
	startedAt: Date
): LocalClarificationProgress {
	return {
		phase: "saving_answer",
		label: "Saving your answer...",
		detail: null,
		attempt: null,
		toolName: null,
		startedAt: startedAt.toISOString(),
	};
}

export function createFallbackClarificationProgress(
	startedAt: Date
): LocalClarificationProgress {
	return {
		phase: "preparing_next_step",
		label: DEFAULT_CLARIFICATION_PROGRESS_FALLBACK_LABEL,
		detail: null,
		attempt: null,
		toolName: null,
		startedAt: startedAt.toISOString(),
	};
}

export function createReviewingClarificationProgress(
	startedAt: Date
): LocalClarificationProgress {
	return {
		phase: "reviewing_known_info",
		label: "Reviewing what we already know...",
		detail: null,
		attempt: null,
		toolName: null,
		startedAt: startedAt.toISOString(),
	};
}

export function createDecisionClarificationProgress(
	startedAt: Date
): LocalClarificationProgress {
	return {
		phase: "deciding_next_question",
		label: "Deciding if we need one more question...",
		detail: null,
		attempt: null,
		toolName: null,
		startedAt: startedAt.toISOString(),
	};
}

export function resolveClarificationProgressView(params: {
	nowMs: number;
	serverProgress: ConversationClarificationProgress | null | undefined;
	localStartedAt: string | null | undefined;
}): ClarificationProgressView | null {
	if (params.serverProgress) {
		return params.serverProgress;
	}

	if (!params.localStartedAt) {
		return null;
	}

	const localStartedAtMs = Date.parse(params.localStartedAt);
	if (!Number.isFinite(localStartedAtMs)) {
		return createOptimisticClarificationProgress(new Date(params.nowMs));
	}

	const startedAtDate = new Date(localStartedAtMs);
	const elapsedMs = params.nowMs - localStartedAtMs;

	if (elapsedMs >= CLARIFICATION_PROGRESS_PREPARING_DELAY_MS) {
		return createFallbackClarificationProgress(startedAtDate);
	}

	if (elapsedMs >= CLARIFICATION_PROGRESS_DECISION_DELAY_MS) {
		return createDecisionClarificationProgress(startedAtDate);
	}

	if (elapsedMs >= CLARIFICATION_PROGRESS_REVIEW_DELAY_MS) {
		return createReviewingClarificationProgress(startedAtDate);
	}

	return createOptimisticClarificationProgress(startedAtDate);
}

export function isClarificationTakingLongerThanUsual(params: {
	nowMs: number;
	serverProgress: ConversationClarificationProgress | null | undefined;
	localStartedAt: string | null | undefined;
}): boolean {
	if (params.serverProgress) {
		return false;
	}

	if (!params.localStartedAt) {
		return false;
	}

	const localStartedAtMs = Date.parse(params.localStartedAt);
	if (!Number.isFinite(localStartedAtMs)) {
		return false;
	}

	return (
		params.nowMs - localStartedAtMs >= CLARIFICATION_PROGRESS_SLOW_WARNING_MS
	);
}
