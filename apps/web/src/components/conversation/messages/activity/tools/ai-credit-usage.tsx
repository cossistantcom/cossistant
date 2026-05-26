"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ActivityWrapper } from "../activity-wrapper";
import type { ToolActivityProps } from "../types";

type CreditPayload = {
	baseCredits: number;
	modelCredits: number;
	thinkingCredits: number;
	toolCredits: number;
	totalCredits: number;
	billableToolCount: number;
	excludedToolCount: number;
	totalToolCount?: number;
	modelId: string;
	modelIdOriginal?: string;
	modelMigrationApplied?: boolean;
	balanceBefore: number | null;
	balanceAfterEstimate: number | null;
	mode: "normal" | "outage";
	blockedReason?: string;
	ingestStatus?: string;
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	reasoningTokens?: number;
	tokenSource?: "provider" | "fallback_constant";
	source?: "primary_pipeline" | "knowledge_clarification";
	phase?:
		| "primary_generation"
		| "clarification_plan_generation"
		| "clarification_answer_evaluation"
		| "faq_draft_generation";
	knowledgeClarificationRequestId?: string;
	knowledgeClarificationStepIndex?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNullableNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function toMode(value: unknown): "normal" | "outage" {
	return value === "outage" ? "outage" : "normal";
}

function toSource(
	value: unknown
): "primary_pipeline" | "knowledge_clarification" | undefined {
	if (value === "primary_pipeline" || value === "knowledge_clarification") {
		return value;
	}

	return;
}

function toPhase(
	value: unknown
):
	| "primary_generation"
	| "clarification_plan_generation"
	| "clarification_answer_evaluation"
	| "faq_draft_generation"
	| undefined {
	if (
		value === "primary_generation" ||
		value === "clarification_plan_generation" ||
		value === "clarification_answer_evaluation" ||
		value === "faq_draft_generation"
	) {
		return value;
	}

	return;
}

function getUsageContextLabel(payload: CreditPayload): string | null {
	if (payload.source !== "knowledge_clarification") {
		return null;
	}

	if (payload.phase === "faq_draft_generation") {
		return "FAQ draft generation";
	}

	if (payload.phase === "clarification_answer_evaluation") {
		return "Clarification answer review";
	}

	return "Knowledge clarification planning";
}

function normalizeCreditPayload(
	payload: Record<string, unknown>
): CreditPayload | null {
	if (typeof payload.totalCredits !== "number") {
		return null;
	}

	return {
		baseCredits: toNumber(payload.baseCredits),
		modelCredits: toNumber(payload.modelCredits),
		thinkingCredits: toNumber(payload.thinkingCredits),
		toolCredits: toNumber(payload.toolCredits),
		totalCredits: toNumber(payload.totalCredits),
		billableToolCount: toNumber(payload.billableToolCount),
		excludedToolCount: toNumber(payload.excludedToolCount),
		totalToolCount: toNumber(payload.totalToolCount),
		modelId: toStringOrEmpty(payload.modelId),
		modelIdOriginal:
			typeof payload.modelIdOriginal === "string"
				? payload.modelIdOriginal
				: undefined,
		modelMigrationApplied: payload.modelMigrationApplied === true,
		balanceBefore: toNullableNumber(payload.balanceBefore),
		balanceAfterEstimate: toNullableNumber(payload.balanceAfterEstimate),
		mode: toMode(payload.mode),
		blockedReason:
			typeof payload.blockedReason === "string"
				? payload.blockedReason
				: undefined,
		ingestStatus:
			typeof payload.ingestStatus === "string"
				? payload.ingestStatus
				: undefined,
		inputTokens:
			typeof payload.inputTokens === "number" ? payload.inputTokens : undefined,
		outputTokens:
			typeof payload.outputTokens === "number"
				? payload.outputTokens
				: undefined,
		totalTokens:
			typeof payload.totalTokens === "number" ? payload.totalTokens : undefined,
		reasoningTokens:
			typeof payload.reasoningTokens === "number"
				? payload.reasoningTokens
				: undefined,
		tokenSource:
			payload.tokenSource === "fallback_constant"
				? "fallback_constant"
				: "provider",
		source: toSource(payload.source),
		phase: toPhase(payload.phase),
		knowledgeClarificationRequestId:
			typeof payload.knowledgeClarificationRequestId === "string"
				? payload.knowledgeClarificationRequestId
				: undefined,
		knowledgeClarificationStepIndex:
			typeof payload.knowledgeClarificationStepIndex === "number"
				? payload.knowledgeClarificationStepIndex
				: undefined,
	};
}

function parsePayload(output: unknown): CreditPayload | null {
	if (!isRecord(output)) {
		return null;
	}

	const directPayload = normalizeCreditPayload(output);
	if (directPayload) {
		return directPayload;
	}

	const credits = isRecord(output.credits) ? output.credits : null;
	if (!credits) {
		return null;
	}

	const normalizedCredits = normalizeCreditPayload(credits);
	if (!normalizedCredits) {
		return null;
	}

	const tokens = isRecord(output.tokens) ? output.tokens : null;
	if (!tokens) {
		return normalizedCredits;
	}

	return {
		...normalizedCredits,
		inputTokens:
			typeof tokens.inputTokens === "number" ? tokens.inputTokens : undefined,
		outputTokens:
			typeof tokens.outputTokens === "number" ? tokens.outputTokens : undefined,
		totalTokens:
			typeof tokens.totalTokens === "number" ? tokens.totalTokens : undefined,
		reasoningTokens:
			typeof tokens.reasoningTokens === "number"
				? tokens.reasoningTokens
				: normalizedCredits.reasoningTokens,
		tokenSource:
			tokens.source === "fallback_constant" ? "fallback_constant" : "provider",
	};
}

function shortenModelId(modelId: string): string {
	const slashIndex = modelId.lastIndexOf("/");
	return slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;
}

function DetailRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium">{children}</span>
		</div>
	);
}

function CreditIcon() {
	return (
		<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground text-xs">
			$
		</div>
	);
}

export function AiCreditUsageActivity({
	toolCall,
	timestamp,
	showIcon = true,
	showStateIndicator = false,
	showTerminalIndicator = true,
}: ToolActivityProps) {
	const [expanded, setExpanded] = useState(false);
	const { state, output } = toolCall;

	if (state === "partial") {
		return (
			<ActivityWrapper
				icon={{ type: "custom", content: <CreditIcon /> }}
				showIcon={showIcon}
				showStateIndicator={showStateIndicator}
				showTerminalIndicator={showTerminalIndicator}
				state="partial"
				text="Calculating credits..."
				timestamp={timestamp}
			/>
		);
	}

	const payload = parsePayload(output);

	if (!payload) {
		return (
			<ActivityWrapper
				icon={{ type: "custom", content: <CreditIcon /> }}
				showIcon={showIcon}
				showStateIndicator={showStateIndicator}
				showTerminalIndicator={showTerminalIndicator}
				state={state}
				text={toolCall.summaryText}
				timestamp={timestamp}
			/>
		);
	}

	if (payload.blockedReason) {
		return (
			<ActivityWrapper
				icon={{ type: "custom", content: <CreditIcon /> }}
				showIcon={showIcon}
				showStateIndicator={showStateIndicator}
				showTerminalIndicator={showTerminalIndicator}
				state="error"
				text={
					<span className="text-destructive/80">
						Credits blocked &mdash; {payload.blockedReason}
					</span>
				}
				timestamp={timestamp}
			/>
		);
	}

	const summaryText = (
		<>
			Used{" "}
			<span className="font-medium text-foreground">
				{payload.totalCredits}
			</span>{" "}
			credits
			{getUsageContextLabel(payload) ? (
				<>
					{" "}
					for{" "}
					<span className="font-medium text-foreground">
						{getUsageContextLabel(payload)}
					</span>
				</>
			) : null}
			{!expanded && (
				<button
					className="ml-1.5 text-muted-foreground/70 text-xs underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground"
					onClick={() => setExpanded(true)}
					type="button"
				>
					Show details
				</button>
			)}
			{expanded && (
				<button
					className="ml-1.5 text-muted-foreground/70 text-xs underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground"
					onClick={() => setExpanded(false)}
					type="button"
				>
					Hide
				</button>
			)}
		</>
	);

	return (
		<ActivityWrapper
			icon={{ type: "custom", content: <CreditIcon /> }}
			showIcon={showIcon}
			showStateIndicator={showStateIndicator}
			showTerminalIndicator={showTerminalIndicator}
			state="result"
			text={summaryText}
			timestamp={timestamp}
		>
			{expanded && (
				<div className="mt-1.5 space-y-1 rounded-md border border-border/50 bg-background/70 p-2.5 text-xs">
					<DetailRow label="Base">{payload.baseCredits}</DetailRow>
					<DetailRow label="Model surcharge">{payload.modelCredits}</DetailRow>
					{payload.thinkingCredits > 0 ? (
						<DetailRow label="AI Thinking">{payload.thinkingCredits}</DetailRow>
					) : null}
					<DetailRow label="Tool costs">
						{payload.toolCredits}
						<span className="ml-1 font-normal text-muted-foreground">
							({payload.billableToolCount} billable
							{payload.excludedToolCount > 0 &&
								`, ${payload.excludedToolCount} excluded`}
							)
						</span>
					</DetailRow>
					{typeof payload.totalTokens === "number" && (
						<DetailRow label="Tokens">
							{payload.totalTokens}
							{typeof payload.inputTokens === "number" &&
							typeof payload.outputTokens === "number" ? (
								<span className="ml-1 font-normal text-muted-foreground">
									({payload.inputTokens} in / {payload.outputTokens} out)
								</span>
							) : null}
							{typeof payload.reasoningTokens === "number" ? (
								<span className="ml-1 font-normal text-muted-foreground">
									/{payload.reasoningTokens} reasoning
								</span>
							) : null}
						</DetailRow>
					)}

					<div className="my-1.5 border-border/30 border-t" />

					{getUsageContextLabel(payload) ? (
						<DetailRow label="Context">
							{getUsageContextLabel(payload)}
						</DetailRow>
					) : null}

					{typeof payload.knowledgeClarificationStepIndex === "number" ? (
						<DetailRow label="Clarification step">
							{payload.knowledgeClarificationStepIndex}
						</DetailRow>
					) : null}

					<DetailRow label="Model">
						<span className="font-mono text-[11px]">
							{payload.modelMigrationApplied && payload.modelIdOriginal ? (
								<>
									{shortenModelId(payload.modelId)}{" "}
									<span className="text-muted-foreground line-through">
										{shortenModelId(payload.modelIdOriginal)}
									</span>
								</>
							) : (
								shortenModelId(payload.modelId)
							)}
						</span>
					</DetailRow>

					{payload.balanceBefore != null &&
						payload.balanceAfterEstimate != null && (
							<DetailRow label="Balance">
								{payload.balanceBefore} &rarr; {payload.balanceAfterEstimate}
							</DetailRow>
						)}

					{payload.mode === "outage" && (
						<DetailRow label="Mode">
							<span
								className={cn(
									"inline-flex items-center rounded border border-dashed px-1 font-medium",
									"border-amber-300/70 bg-amber-100/70 text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-100"
								)}
							>
								outage
							</span>
						</DetailRow>
					)}

					{payload.ingestStatus && payload.ingestStatus !== "ingested" && (
						<DetailRow label="Ingest">
							<span className="text-muted-foreground">
								{payload.ingestStatus}
							</span>
						</DetailRow>
					)}
				</div>
			)}
		</ActivityWrapper>
	);
}
