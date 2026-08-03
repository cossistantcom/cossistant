"use client";

import * as React from "react";
import { cn } from "../support/utils";

export type FeedbackCommentInputProps = Omit<
	React.TextareaHTMLAttributes<HTMLTextAreaElement>,
	"onChange" | "value"
> & {
	value: string;
	onValueChange?: (value: string) => void;
	invalid?: boolean;
};

export function FeedbackCommentInputView(
	{
		value,
		onValueChange,
		invalid = false,
		className,
		...props
	}: FeedbackCommentInputProps,
	ref: React.Ref<HTMLTextAreaElement>
): React.ReactElement {
	return (
		<textarea
			{...props}
			className={cn(
				"w-full resize-none rounded-co border bg-co-background px-3 py-2 text-co-foreground text-sm placeholder:text-co-muted-foreground focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
				invalid
					? "border-co-destructive focus:border-co-destructive focus:ring-co-destructive"
					: "border-co-border focus:border-co-primary focus:ring-co-primary",
				className
			)}
			data-feedback-comment-input="true"
			onChange={(event) => onValueChange?.(event.target.value)}
			ref={ref}
			value={value}
		/>
	);
}

export const FeedbackCommentInput = React.forwardRef<
	HTMLTextAreaElement,
	FeedbackCommentInputProps
>(FeedbackCommentInputView);

FeedbackCommentInput.displayName = "FeedbackCommentInput";
