"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
} from "@/components/ui/select";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AI_PAUSE_STATUS_VALUE, type AiPauseAction } from "./ai-pause-control";

export type ConversationPriorityValue = "low" | "normal" | "high" | "urgent";
export type ConversationSentimentValue = "positive" | "neutral" | "negative";

type ComposerBottomBlockProps = {
	children: ReactNode;
	className?: string;
};

const SENTIMENT_UNKNOWN_VALUE = "__unknown";

const PRIORITY_OPTIONS: Array<{
	value: ConversationPriorityValue;
	label: string;
}> = [
	{ value: "low", label: "Low" },
	{ value: "normal", label: "Normal" },
	{ value: "high", label: "High" },
	{ value: "urgent", label: "Urgent" },
];

const SENTIMENT_OPTIONS: Array<{
	value: ConversationSentimentValue | null;
	selectValue: string;
	label: string;
}> = [
	{ value: null, selectValue: SENTIMENT_UNKNOWN_VALUE, label: "Unknown" },
	{ value: "positive", selectValue: "positive", label: "Positive" },
	{ value: "neutral", selectValue: "neutral", label: "Neutral" },
	{ value: "negative", selectValue: "negative", label: "Negative" },
];

type ComposerDefaultBottomBlockProps = {
	onAiPauseAction?: (action: AiPauseAction) => void;
	isAiPauseControlDisabled: boolean;
	aiPauseStatusLabel: string;
	aiPauseMenuActions: AiPauseAction[];
	onAiPauseSelectValueChange: (value: string) => void;
	getAiPauseActionLabel: (action: AiPauseAction) => string;
	priority: ConversationPriorityValue;
	onPriorityChange?: (priority: ConversationPriorityValue) => void;
	isPriorityActionPending: boolean;
	sentiment: ConversationSentimentValue | null;
	onSentimentChange?: (sentiment: ConversationSentimentValue | null) => void;
	isSentimentActionPending: boolean;
};

export function ComposerBottomBlock({
	children,
	className,
}: ComposerBottomBlockProps) {
	return (
		<div
			className={cn("flex items-center justify-between gap-2 pl-3", className)}
			data-composer-bottom-block="true"
		>
			{children}
		</div>
	);
}

export function ComposerDefaultBottomBlock({
	onAiPauseAction,
	isAiPauseControlDisabled,
	aiPauseStatusLabel,
	aiPauseMenuActions,
	onAiPauseSelectValueChange,
	getAiPauseActionLabel,
	priority,
	onPriorityChange,
	isPriorityActionPending,
	sentiment,
	onSentimentChange,
	isSentimentActionPending,
}: ComposerDefaultBottomBlockProps) {
	const priorityLabel =
		PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ??
		"Normal";
	const sentimentSelectValue = sentiment ?? SENTIMENT_UNKNOWN_VALUE;
	const sentimentLabel =
		SENTIMENT_OPTIONS.find((option) => option.value === sentiment)?.label ??
		"Unknown";

	return (
		<ComposerBottomBlock>
			<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
				{onAiPauseAction ? (
					<Select
						onValueChange={onAiPauseSelectValueChange}
						value={AI_PAUSE_STATUS_VALUE}
					>
						<TooltipOnHover content="Change AI presence in conversation">
							<SelectTrigger
								className="h-6 max-w-56 border-0 bg-transparent px-0 py-0 text-primary text-xs shadow-none hover:cursor-pointer hover:bg-transparent hover:text-primary focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent dark:hover:text-primary [&_svg]:size-3.5 [&_svg]:opacity-70"
								disabled={isAiPauseControlDisabled}
								size="sm"
							>
								<span className="truncate">{aiPauseStatusLabel}</span>
							</SelectTrigger>
						</TooltipOnHover>
						<SelectContent align="start" className="-ml-3">
							<SelectItem className="hidden" value={AI_PAUSE_STATUS_VALUE}>
								{aiPauseStatusLabel}
							</SelectItem>
							{aiPauseMenuActions.map((action, index) => (
								<Fragment key={action}>
									{index === 1 && aiPauseMenuActions[0] === "resume_now" ? (
										<SelectSeparator />
									) : null}
									<SelectItem value={action}>
										{getAiPauseActionLabel(action)}
									</SelectItem>
								</Fragment>
							))}
						</SelectContent>
					</Select>
				) : null}

				{onPriorityChange ? (
					<Select
						onValueChange={(value) =>
							onPriorityChange(value as ConversationPriorityValue)
						}
						value={priority}
					>
						<TooltipOnHover content="Set conversation priority">
							<SelectTrigger
								className="h-6 border-0 bg-transparent px-0 py-0 text-muted-foreground text-xs shadow-none hover:cursor-pointer hover:bg-transparent hover:text-primary focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent dark:hover:text-primary [&_svg]:size-3.5 [&_svg]:opacity-70"
								disabled={isPriorityActionPending}
								size="sm"
							>
								<span className="truncate">Priority: {priorityLabel}</span>
							</SelectTrigger>
						</TooltipOnHover>
						<SelectContent align="start" className="-ml-3">
							{PRIORITY_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}

				{onSentimentChange ? (
					<Select
						onValueChange={(value) =>
							onSentimentChange(
								value === SENTIMENT_UNKNOWN_VALUE
									? null
									: (value as ConversationSentimentValue)
							)
						}
						value={sentimentSelectValue}
					>
						<TooltipOnHover content="Set conversation sentiment">
							<SelectTrigger
								className="h-6 border-0 bg-transparent px-0 py-0 text-muted-foreground text-xs shadow-none hover:cursor-pointer hover:bg-transparent hover:text-primary focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent dark:hover:text-primary [&_svg]:size-3.5 [&_svg]:opacity-70"
								disabled={isSentimentActionPending}
								size="sm"
							>
								<span className="truncate">Sentiment: {sentimentLabel}</span>
							</SelectTrigger>
						</TooltipOnHover>
						<SelectContent align="start" className="-ml-3">
							{SENTIMENT_OPTIONS.map((option) => (
								<SelectItem key={option.selectValue} value={option.selectValue}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>
		</ComposerBottomBlock>
	);
}
