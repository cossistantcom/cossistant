"use client";
import type {
	TargetAndTransition,
	Transition,
	Variant,
	Variants,
} from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type PresetType = "blur" | "fade-in-blur" | "scale" | "fade" | "slide";

export type PerType = "word" | "char" | "line";

const SPACE_REGEX = /(\s+)/;

export type TextEffectProps = {
	children: string | string[];
	per?: PerType;
	as?: keyof React.JSX.IntrinsicElements;
	variants?: {
		container?: Variants;
		item?: Variants;
	};
	className?: string;
	preset?: PresetType;
	delay?: number;
	speedReveal?: number;
	speedSegment?: number;
	trigger?: boolean;
	onAnimationComplete?: () => void;
	onAnimationStart?: () => void;
	segmentWrapperClassName?: string;
	containerTransition?: Transition;
	segmentTransition?: Transition;
	style?: React.CSSProperties;
	showCaret?: boolean;
	caretClassName?: string;
	revealedCount?: number;
};

const defaultStaggerTimes: Record<PerType, number> = {
	char: 0.03,
	word: 0.05,
	line: 0.1,
};

const defaultContainerVariants: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.05,
		},
	},
	exit: {
		transition: { staggerChildren: 0.05, staggerDirection: -1 },
	},
};

const defaultItemVariants: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
	},
	exit: { opacity: 0 },
};

const presetVariants: Record<
	PresetType,
	{ container: Variants; item: Variants }
> = {
	blur: {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0, filter: "blur(12px)" },
			visible: { opacity: 1, filter: "blur(0px)" },
			exit: { opacity: 0, filter: "blur(12px)" },
		},
	},
	"fade-in-blur": {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0, y: 20, filter: "blur(12px)" },
			visible: { opacity: 1, y: 0, filter: "blur(0px)" },
			exit: { opacity: 0, y: 20, filter: "blur(12px)" },
		},
	},
	scale: {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0, scale: 0 },
			visible: { opacity: 1, scale: 1 },
			exit: { opacity: 0, scale: 0 },
		},
	},
	fade: {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0 },
			visible: { opacity: 1 },
			exit: { opacity: 0 },
		},
	},
	slide: {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0, y: 20 },
			visible: { opacity: 1, y: 0 },
			exit: { opacity: 0, y: 20 },
		},
	},
};

const AnimationComponent: React.FC<{
	segment: string;
	variants: Variants;
	per: "line" | "word" | "char";
	segmentWrapperClassName?: string;
}> = React.memo(({ segment, variants, per, segmentWrapperClassName }) => {
	const content =
		per === "line" ? (
			<motion.span className="block" variants={variants}>
				{segment}
			</motion.span>
		) : per === "word" ? (
			<motion.span
				aria-hidden="true"
				className="inline-block whitespace-pre"
				variants={variants}
			>
				{segment}
			</motion.span>
		) : (
			<motion.span className="inline-block whitespace-pre">
				{segment.split("").map((char, charIndex) => (
					<motion.span
						aria-hidden="true"
						className="inline-block whitespace-pre"
						key={`char-${charIndex}`}
						variants={variants}
					>
						{char}
					</motion.span>
				))}
			</motion.span>
		);

	if (!segmentWrapperClassName) {
		return content;
	}

	const defaultWrapperClassName = per === "line" ? "block" : "inline-block";

	return (
		<span className={cn(defaultWrapperClassName, segmentWrapperClassName)}>
			{content}
		</span>
	);
});

AnimationComponent.displayName = "AnimationComponent";

const StaticTypingSegmentComponent: React.FC<{
	segment: string;
	per: "line" | "word" | "char";
	segmentWrapperClassName?: string;
}> = React.memo(({ segment, per, segmentWrapperClassName }) => {
	const content =
		per === "line" ? (
			<span className="block">{segment}</span>
		) : (
			<span aria-hidden="true" className="inline-block whitespace-pre">
				{segment}
			</span>
		);

	if (!segmentWrapperClassName) {
		return content;
	}

	const defaultWrapperClassName = per === "line" ? "block" : "inline-block";

	return (
		<span className={cn(defaultWrapperClassName, segmentWrapperClassName)}>
			{content}
		</span>
	);
});

StaticTypingSegmentComponent.displayName = "StaticTypingSegmentComponent";

const splitText = (text: string, per: PerType) => {
	if (per === "line") {
		return text.split("\n");
	}
	return text.split(SPACE_REGEX);
};

export const getTextEffectTypingSegments = (text: string, per: PerType) => {
	if (per === "char") {
		return Array.from(text);
	}

	return splitText(text, per);
};

export const getTextEffectVisibleText = (
	segments: string[],
	revealedCount: number
) => segments.slice(0, Math.max(revealedCount, 0)).join("");

const hasTransition = (
	variant?: Variant
): variant is TargetAndTransition & { transition?: Transition } => {
	if (!variant) {
		return false;
	}
	return typeof variant === "object" && "transition" in variant;
};

const createVariantsWithTransition = (
	baseVariants: Variants,
	transition?: Transition & { exit?: Transition }
): Variants => {
	if (!transition) {
		return baseVariants;
	}

	const { exit: _, ...mainTransition } = transition;

	return {
		...baseVariants,
		visible: {
			...baseVariants.visible,
			transition: {
				...(hasTransition(baseVariants.visible)
					? baseVariants.visible.transition
					: {}),
				...mainTransition,
			},
		},
		exit: {
			...baseVariants.exit,
			transition: {
				...(hasTransition(baseVariants.exit)
					? baseVariants.exit.transition
					: {}),
				...mainTransition,
				staggerDirection: -1,
			},
		},
	};
};

export function TextEffect({
	children,
	per = "word",
	as = "p",
	variants,
	className,
	preset = "fade",
	delay = 0,
	speedReveal = 1,
	speedSegment = 1,
	trigger = true,
	onAnimationComplete,
	onAnimationStart,
	segmentWrapperClassName,
	containerTransition,
	segmentTransition,
	style,
	showCaret = false,
	caretClassName,
	revealedCount: controlledRevealedCount,
}: TextEffectProps) {
	const fullText = useMemo(
		() => (Array.isArray(children) ? children.join("") : children),
		[children]
	);
	const segments = splitText(fullText, per);
	const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;
	const typingSegments = useMemo(
		() => getTextEffectTypingSegments(fullText, per),
		[fullText, per]
	);
	const isControlledReveal =
		showCaret && typeof controlledRevealedCount === "number";
	const resolvedControlledRevealedCount = controlledRevealedCount ?? 0;
	const [internalRevealedCount, setInternalRevealedCount] = useState(() =>
		isControlledReveal
			? Math.max(
					0,
					Math.min(resolvedControlledRevealedCount, typingSegments.length)
				)
			: showCaret
				? 0
				: typingSegments.length
	);
	const onAnimationCompleteRef = useRef(onAnimationComplete);
	const onAnimationStartRef = useRef(onAnimationStart);

	useEffect(() => {
		onAnimationCompleteRef.current = onAnimationComplete;
	}, [onAnimationComplete]);

	useEffect(() => {
		onAnimationStartRef.current = onAnimationStart;
	}, [onAnimationStart]);

	const baseVariants = preset
		? presetVariants[preset]
		: { container: defaultContainerVariants, item: defaultItemVariants };

	const stagger = defaultStaggerTimes[per] / speedReveal;

	const baseDuration = 0.3 / speedSegment;

	const customStagger = hasTransition(variants?.container?.visible ?? {})
		? (variants?.container?.visible as TargetAndTransition).transition
				?.staggerChildren
		: undefined;

	const customDelay = hasTransition(variants?.container?.visible ?? {})
		? (variants?.container?.visible as TargetAndTransition).transition
				?.delayChildren
		: undefined;

	const computedVariants = {
		container: createVariantsWithTransition(
			variants?.container || baseVariants.container,
			{
				staggerChildren: customStagger ?? stagger,
				delayChildren: customDelay ?? delay,
				...containerTransition,
				exit: {
					staggerChildren: customStagger ?? stagger,
					staggerDirection: -1,
				},
			}
		),
		item: createVariantsWithTransition(variants?.item || baseVariants.item, {
			duration: baseDuration,
			...segmentTransition,
		}),
	};

	useEffect(() => {
		if (isControlledReveal) {
			setInternalRevealedCount(
				Math.max(
					0,
					Math.min(resolvedControlledRevealedCount, typingSegments.length)
				)
			);
			return;
		}

		if (!showCaret) {
			setInternalRevealedCount(typingSegments.length);
			return;
		}

		if (!trigger) {
			setInternalRevealedCount(0);
			return;
		}

		onAnimationStartRef.current?.();
		setInternalRevealedCount(0);

		if (typingSegments.length === 0) {
			onAnimationCompleteRef.current?.();
			return;
		}

		const timeouts: ReturnType<typeof setTimeout>[] = [];
		const stepDelayMs = Math.max(stagger * 1000, 1);
		const startDelayMs = Math.max(delay * 1000, 0);

		timeouts.push(
			setTimeout(() => {
				for (let index = 0; index < typingSegments.length; index += 1) {
					timeouts.push(
						setTimeout(() => {
							setInternalRevealedCount(index + 1);

							if (index === typingSegments.length - 1) {
								onAnimationCompleteRef.current?.();
							}
						}, index * stepDelayMs)
					);
				}
			}, startDelayMs)
		);

		return () => {
			for (const timeout of timeouts) {
				clearTimeout(timeout);
			}
		};
	}, [
		delay,
		isControlledReveal,
		resolvedControlledRevealedCount,
		showCaret,
		stagger,
		trigger,
		typingSegments,
	]);

	if (showCaret) {
		const visibleSegments = typingSegments.slice(0, internalRevealedCount);

		return (
			<AnimatePresence mode="popLayout">
				{trigger && (
					<MotionTag className={className} style={style}>
						{per !== "line" ? (
							<span className="sr-only">{fullText}</span>
						) : null}
						<span
							className={cn(per === "line" ? "block" : "inline")}
							data-text-effect-visible="true"
						>
							{visibleSegments.map((segment, index) => (
								<StaticTypingSegmentComponent
									key={`${per}-typing-${index}-${segment}`}
									per={per}
									segment={segment}
									segmentWrapperClassName={segmentWrapperClassName}
								/>
							))}
							<motion.span
								animate={{ opacity: [1, 1, 0, 0] }}
								aria-hidden="true"
								className={cn(
									per === "line"
										? "mt-1 block h-[1em] w-px bg-current"
										: "ml-px inline-block h-[1em] w-px bg-current align-[-0.12em]",
									caretClassName
								)}
								data-text-effect-caret="true"
								transition={{
									duration: 1,
									ease: "linear",
									repeat: Number.POSITIVE_INFINITY,
									times: [0, 0.45, 0.46, 1],
								}}
							/>
						</span>
					</MotionTag>
				)}
			</AnimatePresence>
		);
	}

	return (
		<AnimatePresence mode="popLayout">
			{trigger && (
				<MotionTag
					animate="visible"
					className={className}
					exit="exit"
					initial="hidden"
					onAnimationComplete={onAnimationComplete}
					onAnimationStart={onAnimationStart}
					style={style}
					variants={computedVariants.container}
				>
					{per !== "line" ? <span className="sr-only">{children}</span> : null}
					{segments.map((segment, index) => (
						<AnimationComponent
							key={`${per}-${index}-${segment}`}
							per={per}
							segment={segment}
							segmentWrapperClassName={segmentWrapperClassName}
							variants={computedVariants.item}
						/>
					))}
					{showCaret ? (
						<motion.span
							animate={{ opacity: [1, 1, 0, 0] }}
							aria-hidden="true"
							className={cn(
								"ml-px inline-block h-[1em] w-px bg-current align-[-0.12em]",
								caretClassName
							)}
							data-text-effect-caret="true"
							transition={{
								duration: 1,
								ease: "linear",
								repeat: Number.POSITIVE_INFINITY,
								times: [0, 0.45, 0.46, 1],
							}}
						/>
					) : null}
				</MotionTag>
			)}
		</AnimatePresence>
	);
}
