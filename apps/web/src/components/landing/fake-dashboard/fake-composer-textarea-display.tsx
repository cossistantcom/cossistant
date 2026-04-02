"use client";

import { TextEffect } from "@/components/ui/text-effect";
import { cn } from "@/lib/utils";

type FakeComposerTextareaDisplayProps = {
	value: string;
	placeholder: string;
	isTyping?: boolean;
	className?: string;
	textClassName?: string;
	typingClassName?: string;
	placeholderClassName?: string;
	caretClassName?: string;
	speedReveal?: number;
};

export function FakeComposerTextareaDisplay({
	value,
	placeholder,
	isTyping = false,
	className,
	textClassName,
	typingClassName,
	placeholderClassName,
	caretClassName = "bg-plasma-orange",
	speedReveal = 1.8,
}: FakeComposerTextareaDisplayProps) {
	const state =
		value.length === 0 ? "placeholder" : isTyping ? "typing" : "value";

	return (
		<div
			className={cn(
				"h-auto min-h-12 w-full whitespace-pre-wrap break-words text-sm leading-6",
				className
			)}
			data-fake-textarea-display="true"
			data-fake-textarea-display-state={state}
		>
			{state === "typing" ? (
				<TextEffect
					as="div"
					caretClassName={caretClassName}
					className={cn("text-foreground", textClassName, typingClassName)}
					per="char"
					preset="fade"
					showCaret={true}
					speedReveal={speedReveal}
				>
					{value}
				</TextEffect>
			) : state === "value" ? (
				<div className={cn("text-foreground", textClassName)}>{value}</div>
			) : (
				<div className={cn("text-primary/50", placeholderClassName)}>
					{placeholder}
				</div>
			)}
		</div>
	);
}
