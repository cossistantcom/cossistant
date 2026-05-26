import type { ToolTimelineLogType } from "@cossistant/types";
import type { LucideIcon } from "lucide-react";
import type React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ActivityIcon } from "../activity-wrapper";
import type {
	NormalizedToolCall,
	ToolActivityProps,
	ToolCallState,
} from "../types";

function safeJson(value: unknown): string {
	try {
		const serialized = JSON.stringify(value, null, 2);
		if (!serialized) {
			return "{}";
		}
		if (serialized.length <= 4000) {
			return serialized;
		}
		return `${serialized.slice(0, 4000)}\n... [truncated]`;
	} catch {
		return "[unserializable value]";
	}
}

const stateConfig: Record<ToolCallState, { label: string; className: string }> =
	{
		partial: {
			label: "Running",
			className:
				"border-amber-300/70 bg-amber-100/70 text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-100",
		},
		result: {
			label: "Success",
			className:
				"border-cossistant-green/70 bg-cossistant-green/5 text-cossistant-green dark:border-cossistant-green/50 dark:bg-cossistant-green/10 dark:text-cossistant-green",
		},
		error: {
			label: "Error",
			className:
				"border-red-300/70 bg-red-100/70 text-red-900 dark:border-red-700/70 dark:bg-red-900/30 dark:text-red-100",
		},
	};

const logTypeConfig: Record<
	ToolTimelineLogType,
	{ label: string; className: string }
> = {
	customer_facing: {
		label: "Customer",
		className:
			"border-sky-300/70 bg-sky-100/70 text-sky-900 dark:border-sky-700/70 dark:bg-sky-900/30 dark:text-sky-100",
	},
	log: {
		label: "Log",
		className: "border-primary/20 text-primary/50 dark:border-primary/15",
	},
	decision: {
		label: "Decision",
		className:
			"border-cossistant-blue bg-cossistant-blue/5 text-cossistant-blue dark:border-cossistant-blue/50 dark:bg-cossistant-blue/10 dark:text-cossistant-blue",
	},
};

function DebugBlock({
	label,
	value,
	preClassName,
}: {
	label: string;
	value: unknown;
	preClassName?: string;
}) {
	return (
		<div className="space-y-1">
			<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
				{label}
			</div>
			<pre
				className={cn(
					"max-h-56 overflow-auto rounded-md border border-border/50 bg-background/70 p-2 text-[11px] leading-relaxed",
					preClassName
				)}
			>
				{safeJson(value)}
			</pre>
		</div>
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDisplayString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function toDisplayNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type AiThinkingTracePayload = {
	modelId: string | null;
	workflowRunId: string | null;
	attempt: number | null;
	thinkingCredits: number | null;
	captureStatus: string | null;
	reasoningMaxTokens: number | null;
	reasoningText: string | null;
	tokens: {
		inputTokens: number | null;
		outputTokens: number | null;
		totalTokens: number | null;
		reasoningTokens: number | null;
	};
};

function parseAiThinkingTracePayload(
	output: unknown
): AiThinkingTracePayload | null {
	if (!isRecord(output)) {
		return null;
	}

	const tokens = isRecord(output.tokens) ? output.tokens : {};
	return {
		modelId: toDisplayString(output.modelId),
		workflowRunId: toDisplayString(output.workflowRunId),
		attempt: toDisplayNumber(output.attempt),
		thinkingCredits: toDisplayNumber(output.thinkingCredits),
		captureStatus: toDisplayString(output.captureStatus),
		reasoningMaxTokens: toDisplayNumber(output.reasoningMaxTokens),
		reasoningText: toDisplayString(output.reasoningText),
		tokens: {
			inputTokens: toDisplayNumber(tokens.inputTokens),
			outputTokens: toDisplayNumber(tokens.outputTokens),
			totalTokens: toDisplayNumber(tokens.totalTokens),
			reasoningTokens: toDisplayNumber(tokens.reasoningTokens),
		},
	};
}

function InlineMetric({
	label,
	value,
}: {
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="min-w-0">
			<div className="text-[10px] text-muted-foreground uppercase tracking-wide">
				{label}
			</div>
			<div className="truncate font-mono text-[11px] text-foreground">
				{value}
			</div>
		</div>
	);
}

function AiThinkingTraceDetails({
	toolCall,
}: {
	toolCall: NormalizedToolCall;
}) {
	const payload = parseAiThinkingTracePayload(toolCall.output);
	if (!payload) {
		return null;
	}

	const tokenText =
		payload.tokens.totalTokens === null
			? "unknown"
			: `${payload.tokens.totalTokens} total`;
	const ioText =
		payload.tokens.inputTokens !== null && payload.tokens.outputTokens !== null
			? `${payload.tokens.inputTokens} in / ${payload.tokens.outputTokens} out`
			: "input/output unknown";
	const reasoningText =
		payload.tokens.reasoningTokens === null
			? "unknown"
			: `${payload.tokens.reasoningTokens} reasoning`;

	return (
		<div className="space-y-2 border-b border-dashed p-2">
			<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
				<InlineMetric label="Model" value={payload.modelId ?? "unknown"} />
				<InlineMetric label="Attempt" value={payload.attempt ?? "unknown"} />
				<InlineMetric
					label="Capture"
					value={payload.captureStatus ?? "unknown"}
				/>
				<InlineMetric
					label="Credits"
					value={payload.thinkingCredits ?? "unknown"}
				/>
				<InlineMetric
					label="Reasoning cap"
					value={payload.reasoningMaxTokens ?? "unknown"}
				/>
				<InlineMetric label="Tokens" value={tokenText} />
				<InlineMetric label="I/O" value={ioText} />
				<InlineMetric label="Reasoning tokens" value={reasoningText} />
			</div>
			{payload.workflowRunId ? (
				<div className="font-mono text-[10px] text-muted-foreground">
					workflow: {payload.workflowRunId}
				</div>
			) : null}
			{payload.reasoningText ? (
				<div className="space-y-1">
					<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						Reasoning
					</div>
					<pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-background/70 p-2 text-[11px] leading-relaxed">
						{payload.reasoningText}
					</pre>
				</div>
			) : (
				<div className="text-[11px] text-muted-foreground">
					Reasoning was enabled, but no text was captured from the provider.
				</div>
			)}
		</div>
	);
}

function DeveloperToolDetails({ toolCall }: { toolCall: NormalizedToolCall }) {
	if (toolCall.toolName === "aiThinkingTrace") {
		return <AiThinkingTraceDetails toolCall={toolCall} />;
	}

	return null;
}

function StatusBadge({ state }: { state: ToolCallState }) {
	const config = stateConfig[state];
	return (
		<span
			className={cn(
				"inline-flex items-center rounded border border-dashed px-1 font-medium",
				config.className
			)}
		>
			{config.label}
		</span>
	);
}

function LogTypeBadge({ logType }: { logType: ToolTimelineLogType }) {
	const config = logTypeConfig[logType];
	return (
		<span
			className={cn(
				"inline-flex items-center rounded border border-dashed px-1 font-medium",
				config.className
			)}
		>
			{config.label}
		</span>
	);
}

function resolveIcon(icon: ActivityIcon | undefined): ActivityIcon {
	if (icon) {
		return icon;
	}
	return { type: "logo" };
}

function IconRenderer({ icon }: { icon: ActivityIcon | undefined }) {
	const resolvedIcon = resolveIcon(icon);

	switch (resolvedIcon.type) {
		case "spinner":
			return (
				<div className="flex size-6 shrink-0 items-center justify-center">
					<Spinner className="size-5" size={20} />
				</div>
			);
		case "avatar":
			return (
				<Avatar
					className="size-6 shrink-0 overflow-clip"
					fallbackName={resolvedIcon.name}
					url={resolvedIcon.image}
				/>
			);
		case "icon": {
			const Icon = resolvedIcon.Icon as LucideIcon;
			return (
				<div className="flex size-6 shrink-0 items-center justify-center">
					<Icon
						aria-hidden
						className="size-4 text-muted-foreground"
						data-activity-icon={resolvedIcon.iconKey}
					/>
				</div>
			);
		}
		case "custom":
			return <>{resolvedIcon.content}</>;
		default:
			return (
				<div className="flex size-6 shrink-0 items-center justify-center">
					<Logo className="size-5 text-primary/90" />
				</div>
			);
	}
}

export function DeveloperToolView({
	toolCall,
	timestamp,
	showIcon = true,
	icon,
}: ToolActivityProps) {
	const developerDetails = <DeveloperToolDetails toolCall={toolCall} />;

	return (
		<div className={cn("flex w-full", showIcon ? "gap-2" : "gap-0")}>
			{showIcon ? <IconRenderer icon={icon} /> : null}
			<div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5 pb-1.5 pl-1">
				<div className="flex items-center justify-between text-muted-foreground text-xs">
					<span>{toolCall.summaryText}</span>

					<div className="flex items-center gap-2 text-xs">
						<StatusBadge state={toolCall.state} />
						<LogTypeBadge logType={toolCall.logType} />
					</div>
				</div>
				<div className="rounded border border-dashed dark:bg-background-200">
					<div className="flex items-center gap-10 border-b border-dashed bg-background p-2 font-mono text-[11px] leading-relaxed">
						<div>
							<span className="text-muted-foreground">tool</span>:{" "}
							{toolCall.toolName}
						</div>
						<div>
							<span className="text-muted-foreground">call</span>:{" "}
							{toolCall.toolCallId}
						</div>
					</div>

					{toolCall.isFallback ? (
						<div className="mt-2 text-[11px] text-muted-foreground">
							Fallback rendered from timeline metadata.
						</div>
					) : null}

					{developerDetails}

					<details className="group p-2">
						<summary className="cursor-pointer text-right font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
							Dev payload
						</summary>
						<div className="mt-2 space-y-2">
							<DebugBlock
								label="Input"
								preClassName="bg-background-300 font-mono"
								value={toolCall.input}
							/>
							{toolCall.state === "result" && toolCall.output !== undefined ? (
								<DebugBlock
									label="Output"
									preClassName="bg-background-300 font-mono"
									value={toolCall.output}
								/>
							) : null}
							{toolCall.state === "error" && toolCall.errorText ? (
								<DebugBlock
									label="Error"
									preClassName="bg-background/90 font-mono"
									value={toolCall.errorText}
								/>
							) : null}
						</div>
					</details>
				</div>
				<time className="text-muted-foreground text-xs">{timestamp}</time>
			</div>
		</div>
	);
}
