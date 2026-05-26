import type { PrimaryPipelineResult } from "../contracts";
import {
	finalizeStageMetrics,
	type MutableStageMetrics,
} from "./stage-metrics";

type ResultParams = {
	metrics: MutableStageMetrics;
	pipelineStartedAt: number;
	cursorDisposition?: PrimaryPipelineResult["cursorDisposition"];
	publicMessagesSent?: number;
	usageTokens?: PrimaryPipelineResult["usageTokens"];
	creditUsage?: PrimaryPipelineResult["creditUsage"];
	openRouterByokRetry?: PrimaryPipelineResult["openRouterByokRetry"];
};

type FinalizedResultParams =
	| (ResultParams & {
			status: "completed";
			action?: string;
			reason?: string;
	  })
	| (ResultParams & {
			status: "skipped";
			action?: string;
			reason: string;
	  })
	| (ResultParams & {
			status: "error";
			action?: string;
			error: string;
			retryable?: boolean;
	  });

export function buildPrimaryPipelineResult(
	params: FinalizedResultParams
): PrimaryPipelineResult {
	const retryable =
		params.status === "error" ? (params.retryable ?? true) : false;
	const cursorDisposition =
		params.cursorDisposition ?? (retryable ? "retry" : "advance");

	const baseResult = {
		status: params.status,
		action: params.action,
		cursorDisposition,
		publicMessagesSent: params.publicMessagesSent ?? 0,
		retryable,
		usageTokens: params.usageTokens,
		creditUsage: params.creditUsage,
		openRouterByokRetry: params.openRouterByokRetry,
		metrics: finalizeStageMetrics({
			metrics: params.metrics,
			pipelineStartedAt: params.pipelineStartedAt,
		}),
	};

	switch (params.status) {
		case "completed":
			return {
				...baseResult,
				reason: params.reason,
			};
		case "skipped":
			return {
				...baseResult,
				reason: params.reason,
			};
		case "error":
			return {
				...baseResult,
				error: params.error,
			};
		default:
			return baseResult;
	}
}
