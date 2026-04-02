"use client";

import type { ConversationClarificationProgress } from "@plasma/types";

export type LocalClarificationProgressPhase =
	| "saving_answer"
	| "waiting_for_server";

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

export const CLARIFICATION_PROGRESS_FALLBACK_DELAY_MS = 1500;
export const DEFAULT_CLARIFICATION_PROGRESS_FALLBACK_LABEL =
	"Reviewing your answer...";

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
		phase: "waiting_for_server",
		label: DEFAULT_CLARIFICATION_PROGRESS_FALLBACK_LABEL,
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
	return params.nowMs - localStartedAtMs >=
		CLARIFICATION_PROGRESS_FALLBACK_DELAY_MS
		? createFallbackClarificationProgress(startedAtDate)
		: createOptimisticClarificationProgress(startedAtDate);
}
