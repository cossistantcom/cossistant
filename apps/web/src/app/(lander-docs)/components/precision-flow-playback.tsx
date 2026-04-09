"use client";

import { motion } from "motion/react";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Composer,
	type MessageVisibility,
} from "@/components/conversation/composer";
import {
	ClarificationActionsBlock,
	ClarificationDraftReadyBanner,
	ClarificationQuestionBlock,
	ClarificationTopicBlock,
} from "@/components/conversation/composer/clarification-composer-flow";
import { ClarificationPromptCard } from "@/components/conversation/composer/clarification-teaser";
import { KnowledgeClarificationDraftPreviewCard } from "@/components/knowledge-clarification/draft-review";
import { marcVisitor } from "@/components/landing/fake-dashboard/data";
import { FakeComposerTextareaDisplay } from "@/components/landing/fake-dashboard/fake-composer-textarea-display";
import { FakeConversationTimelineList } from "@/components/landing/fake-dashboard/fake-conversation/fake-conversation-timeline-list";
import { FakeMouseCursor } from "@/components/landing/fake-dashboard/fake-inbox/fake-mouse-cursor";
import { Background } from "@/components/ui/background";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimationScheduler } from "@/hooks/use-animation-scheduler";
import { useViewportVisibility } from "@/hooks/use-viewport-visibility";
import { cn } from "@/lib/utils";
import {
	buildPrecisionFlowScene,
	getPrecisionFlowRemainingSequence,
	getPrecisionFlowStartPhaseForStep,
	PRECISION_FLOW_INITIAL_PHASE,
	PRECISION_FLOW_QUESTION_ONE_ANSWER,
	PRECISION_FLOW_QUESTION_TWO_ANSWER,
	PRECISION_FLOW_STEPS,
	type PrecisionFlowComposerState,
	type PrecisionFlowPhase,
	type PrecisionFlowStepId,
	resetPrecisionFlowPlaybackState,
} from "./precision-flow-demo";
import {
	getPrecisionFlowPrimaryActionPresentation,
	getPrecisionFlowReplayButtonLabel,
} from "./precision-flow-presentation";

type PrecisionFlowPlaybackProviderProps = {
	initialPhase: PrecisionFlowPhase;
	autoplay: boolean;
	className?: string;
	children: React.ReactNode;
	externalPlayback?: {
		isPlaying: boolean;
		playToken: number;
		resetToken: number;
	};
};

type PrecisionFlowPlaybackContextValue = {
	handleAnswerSelectCursorClick: () => void;
	handleApproveCursorClick: () => void;
	handleClarifyCursorClick: () => void;
	handleQuestionOneNextCursorClick: () => void;
	isManuallyPaused: boolean;
	jumpToStep: (stepId: PrecisionFlowStepId) => void;
	phase: PrecisionFlowPhase;
	replay: () => void;
	replayCountdownSeconds: number | null;
	resume: () => void;
	scene: ReturnType<typeof buildPrecisionFlowScene>;
	composerVisibility: MessageVisibility;
	setComposerVisibility: (visibility: MessageVisibility) => void;
};

const PrecisionFlowPlaybackContext =
	createContext<PrecisionFlowPlaybackContextValue | null>(null);

const PRECISION_FLOW_AUTOREPLAY_SECONDS = 10;

function usePrecisionFlowPlaybackContext() {
	const context = useContext(PrecisionFlowPlaybackContext);

	if (!context) {
		throw new Error(
			"PrecisionFlow playback components must be used inside PrecisionFlowPlaybackProvider."
		);
	}

	return context;
}

function PrecisionFlowComposer({
	composerState,
	composerValue,
	topicSummary,
	clarifyButtonRef,
	nextButtonRef,
	approveButtonRef,
	suggestedAnswerButtonRef,
	visibility,
	onVisibilityChange,
}: {
	composerState: PrecisionFlowComposerState;
	composerValue: string;
	topicSummary: string;
	clarifyButtonRef: React.RefObject<HTMLButtonElement | null>;
	nextButtonRef: React.RefObject<HTMLButtonElement | null>;
	approveButtonRef: React.RefObject<HTMLButtonElement | null>;
	suggestedAnswerButtonRef: React.RefObject<HTMLButtonElement | null>;
	visibility: MessageVisibility;
	onVisibilityChange: (visibility: MessageVisibility) => void;
}) {
	let aboveBlock: React.ReactNode = null;
	let centralBlock: React.ReactNode = null;
	let bottomBlock: React.ReactNode = null;

	if (composerState.kind === "prompt") {
		aboveBlock = (
			<ClarificationPromptCard
				clarifyButtonRef={clarifyButtonRef}
				onClarify={() => {}}
				onDismiss={() => {}}
				onLater={() => {}}
				topicSummary={topicSummary}
			/>
		);
	} else if (composerState.kind === "question") {
		aboveBlock = (
			<ClarificationTopicBlock
				maxSteps={composerState.maxSteps}
				stepIndex={composerState.stepIndex}
				topicSummary={topicSummary}
			/>
		);
		centralBlock = (
			<ClarificationQuestionBlock
				autoFocus={false}
				freeAnswer={composerState.freeAnswer}
				getSuggestedAnswerButtonRef={(answer) =>
					answer === PRECISION_FLOW_QUESTION_TWO_ANSWER
						? suggestedAnswerButtonRef
						: undefined
				}
				inputMode={composerState.inputMode}
				isOtherSelected={composerState.freeAnswer.trim().length > 0}
				isPending={false}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question={composerState.question}
				selectedAnswer={composerState.selectedAnswer}
				suggestedAnswers={composerState.suggestedAnswers}
				textareaOverlay={
					composerState.inputMode === "textarea_first" ? (
						<FakeComposerTextareaDisplay
							className="pt-0"
							isTyping={true}
							placeholder="Describe how this workflow or rule works today..."
							speedReveal={0.9}
							textClassName="text-primary"
							typingClassName="leading-6"
							value={PRECISION_FLOW_QUESTION_ONE_ANSWER}
						/>
					) : undefined
				}
			/>
		);
		bottomBlock = (
			<ClarificationActionsBlock
				canSkip={true}
				canSubmit={true}
				isPending={false}
				isSkipping={false}
				isSubmitting={false}
				onCancel={() => {}}
				onSkip={() => {}}
				onSubmit={() => {}}
				submitButtonRef={
					composerState.stepIndex === 1 ? nextButtonRef : undefined
				}
			/>
		);
	} else if (composerState.kind === "analyzing") {
		aboveBlock = (
			<ClarificationTopicBlock
				maxSteps={composerState.maxSteps}
				stepIndex={composerState.stepIndex}
				topicSummary={topicSummary}
			/>
		);
		centralBlock = (
			<ClarificationQuestionBlock
				freeAnswer={composerState.freeAnswer}
				inputMode={composerState.inputMode}
				isOtherSelected={composerState.freeAnswer.trim().length > 0}
				isPending={true}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question={composerState.question}
				selectedAnswer={composerState.selectedAnswer}
				suggestedAnswers={composerState.suggestedAnswers}
			/>
		);
		bottomBlock = (
			<ClarificationActionsBlock
				canSkip={true}
				canSubmit={true}
				isPending={true}
				isSkipping={false}
				isSubmitting={true}
				onCancel={() => {}}
				onSkip={() => {}}
				onSubmit={() => {}}
			/>
		);
	} else if (composerState.kind === "draft_ready") {
		aboveBlock = (
			<ClarificationDraftReadyBanner
				approveButtonRef={approveButtonRef}
				canApprove={true}
				canView={true}
				isApproving={false}
				onApprove={() => {}}
				onClose={() => {}}
				onView={() => {}}
				request={null}
				topicSummary={topicSummary}
			/>
		);
	}

	return (
		<Composer
			aboveBlock={aboveBlock}
			autoFocus={false}
			bottomBlock={bottomBlock}
			centralBlock={centralBlock}
			layoutMode="inline"
			onAiPauseAction={() => {}}
			onChange={() => {}}
			onFileSelect={() => {}}
			onSubmit={() => {}}
			onVisibilityChange={onVisibilityChange}
			placeholder="Type your message..."
			value={composerValue}
			visibility={visibility}
		/>
	);
}

function PrecisionFlowFaqSkeletonItem({
	position,
	className,
}: {
	position: "before" | "after";
	className?: string;
}) {
	return (
		<div
			className={cn(
				"border border-dashed bg-background px-5 py-5 dark:bg-background-50",
				className
			)}
			data-precision-faq-skeleton={position}
		>
			<div className="space-y-3">
				<Skeleton className="h-5 w-2/3 rounded-none" />
				<Skeleton className="h-4 w-full rounded-none" />
				<Skeleton className="h-4 w-[86%] rounded-none" />
			</div>
		</div>
	);
}

function PrecisionFlowFaqCreatedCard({
	draft,
}: {
	draft: ReturnType<typeof buildPrecisionFlowScene>["faqDraft"];
}) {
	return (
		<div
			className="flex h-full min-h-[440px] w-full items-center justify-center px-4 py-6 lg:px-8"
			data-precision-faq-created-state="true"
		>
			<div
				className="flex w-full max-w-xl flex-col gap-4"
				data-precision-faq-list="true"
			>
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className="w-[84%] self-center"
					data-precision-faq-list-item="before"
					initial={{ opacity: 0, y: 10 }}
					transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
				>
					<PrecisionFlowFaqSkeletonItem position="before" />
				</motion.div>
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className="w-full self-center"
					data-precision-faq-list-item="approved"
					initial={{ opacity: 0, y: 12 }}
					transition={{
						duration: 0.22,
						ease: [0.2, 0.8, 0.2, 1],
						delay: 0.04,
					}}
				>
					<KnowledgeClarificationDraftPreviewCard
						className="w-full"
						draft={draft}
						minimalPills={["FAQ generated", "Account", "Deletion"]}
						variant="minimal"
					/>
				</motion.div>
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className="w-[86%] self-center"
					data-precision-faq-list-item="after"
					initial={{ opacity: 0, y: 10 }}
					transition={{
						duration: 0.18,
						ease: [0.2, 0.8, 0.2, 1],
						delay: 0.08,
					}}
				>
					<PrecisionFlowFaqSkeletonItem position="after" />
				</motion.div>
			</div>
		</div>
	);
}

function PrecisionFlowTimeline({
	timelineItems,
}: {
	timelineItems: ReturnType<typeof buildPrecisionFlowScene>["timelineItems"];
}) {
	return (
		<FakeConversationTimelineList
			className="w-full"
			items={timelineItems}
			layoutMode="centered"
			typingActors={[]}
			visitor={marcVisitor}
		/>
	);
}

function PrecisionFlowConversationStage({
	composerState,
	composerValue,
	timelineItems,
	topicSummary,
	visibility,
	onVisibilityChange,
	showComposer,
	showTimeline,
	showClarifyCursor,
	showQuestionOneNextCursor,
	showAnswerSelectCursor,
	showApproveCursor,
	onClarifyCursorClick,
	onQuestionOneNextCursorClick,
	onAnswerSelectCursorClick,
	onApproveCursorClick,
	isClarifyTransition,
}: {
	composerState: PrecisionFlowComposerState;
	composerValue: string;
	timelineItems: ReturnType<typeof buildPrecisionFlowScene>["timelineItems"];
	topicSummary: string;
	visibility: MessageVisibility;
	onVisibilityChange: (visibility: MessageVisibility) => void;
	showComposer: boolean;
	showTimeline: boolean;
	showClarifyCursor: boolean;
	showQuestionOneNextCursor: boolean;
	showAnswerSelectCursor: boolean;
	showApproveCursor: boolean;
	onClarifyCursorClick: () => void;
	onQuestionOneNextCursorClick: () => void;
	onAnswerSelectCursorClick: () => void;
	onApproveCursorClick: () => void;
	isClarifyTransition: boolean;
}) {
	const cursorContainerRef = useRef<HTMLDivElement>(null);
	const clarifyButtonRef = useRef<HTMLButtonElement>(null);
	const nextButtonRef = useRef<HTMLButtonElement>(null);
	const suggestedAnswerButtonRef = useRef<HTMLButtonElement>(null);
	const approveButtonRef = useRef<HTMLButtonElement>(null);

	return (
		<div
			className="relative z-10 flex h-full min-h-[440px] w-full items-center justify-center px-4 py-6 lg:px-8"
			data-precision-stage-layout="centered"
			ref={cursorContainerRef}
		>
			{isClarifyTransition ? (
				<div
					className="relative flex w-full max-w-2xl items-center justify-center"
					data-precision-transition-stage="clarify"
				>
					<div className="pointer-events-none absolute inset-0 flex items-center">
						<motion.div
							animate={{ opacity: 0, y: 36 }}
							className="w-full"
							data-precision-transition-layer="timeline"
							initial={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
						>
							<PrecisionFlowTimeline timelineItems={timelineItems} />
						</motion.div>
					</div>
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="relative z-10 w-full"
						data-precision-transition-layer="composer"
						initial={{ opacity: 0, y: 36 }}
						transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
					>
						<PrecisionFlowComposer
							approveButtonRef={approveButtonRef}
							clarifyButtonRef={clarifyButtonRef}
							composerState={composerState}
							composerValue={composerValue}
							nextButtonRef={nextButtonRef}
							onVisibilityChange={onVisibilityChange}
							suggestedAnswerButtonRef={suggestedAnswerButtonRef}
							topicSummary={topicSummary}
							visibility={visibility}
						/>
					</motion.div>
				</div>
			) : (
				<div className="flex w-full max-w-2xl flex-col justify-center gap-6">
					{showTimeline ? (
						<PrecisionFlowTimeline timelineItems={timelineItems} />
					) : null}
					{showComposer ? (
						<PrecisionFlowComposer
							approveButtonRef={approveButtonRef}
							clarifyButtonRef={clarifyButtonRef}
							composerState={composerState}
							composerValue={composerValue}
							nextButtonRef={nextButtonRef}
							onVisibilityChange={onVisibilityChange}
							suggestedAnswerButtonRef={suggestedAnswerButtonRef}
							topicSummary={topicSummary}
							visibility={visibility}
						/>
					) : null}
				</div>
			)}
			{showClarifyCursor ? (
				<div data-precision-cursor="clarify">
					<FakeMouseCursor
						containerRef={cursorContainerRef}
						isVisible={showClarifyCursor}
						onClick={onClarifyCursorClick}
						targetElementRef={clarifyButtonRef}
						targetMode="element"
					/>
				</div>
			) : null}
			{showQuestionOneNextCursor ? (
				<div data-precision-cursor="question-one-next">
					<FakeMouseCursor
						containerRef={cursorContainerRef}
						isVisible={showQuestionOneNextCursor}
						onClick={onQuestionOneNextCursorClick}
						targetElementRef={nextButtonRef}
						targetMode="element"
					/>
				</div>
			) : null}
			{showApproveCursor ? (
				<div data-precision-cursor="approve">
					<FakeMouseCursor
						containerRef={cursorContainerRef}
						isVisible={showApproveCursor}
						onClick={onApproveCursorClick}
						targetElementRef={approveButtonRef}
						targetMode="element"
					/>
				</div>
			) : null}
			{showAnswerSelectCursor ? (
				<div data-precision-cursor="answer-select">
					<FakeMouseCursor
						containerRef={cursorContainerRef}
						isVisible={showAnswerSelectCursor}
						onClick={onAnswerSelectCursorClick}
						targetElementRef={suggestedAnswerButtonRef}
						targetMode="element"
					/>
				</div>
			) : null}
		</div>
	);
}

function PrecisionFlowRightPanel({
	children,
	showOpeningMessageRadial = false,
}: {
	children: React.ReactNode;
	showOpeningMessageRadial?: boolean;
}) {
	return (
		<div
			className="relative flex h-full w-full flex-1 overflow-clip bg-background dark:bg-background-50"
			data-precision-background-trail="enabled"
		>
			<Background fieldOpacity={0.06} interactive={true} pointerTrail={true} />
			{showOpeningMessageRadial ? (
				<div
					className="pointer-events-none absolute inset-[1px] flex justify-center px-4 pb-16 lg:px-8 lg:py-16 xl:px-1"
					data-precision-opening-radial="true"
				>
					<div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-full bg-linear-to-r from-background to-transparent" />
					<div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-full bg-linear-to-r from-background to-transparent" />
					<div
						className={cn(
							"my-auto h-full w-full max-w-2xl",
							"bg-[radial-gradient(ellipse_68%_52%_at_50%_44%,var(--background)_0%,var(--background)_30%,transparent_74%)]",
							"dark:bg-[radial-gradient(ellipse_68%_52%_at_50%_44%,var(--background-50)_0%,var(--background-50)_30%,transparent_74%)]"
						)}
					/>
				</div>
			) : null}
			<div className="pointer-events-none relative z-10 flex h-full w-full flex-1 px-4 pb-16 lg:px-8 lg:py-16 xl:px-1">
				{children}
			</div>
		</div>
	);
}

function usePrecisionFlowPlayback({
	initialPhase,
	autoplay,
	externalPlayback,
}: {
	initialPhase: PrecisionFlowPhase;
	autoplay: boolean;
	externalPlayback?: PrecisionFlowPlaybackProviderProps["externalPlayback"];
}) {
	const isExternallyControlled = externalPlayback !== undefined;
	const shouldAutoplay = autoplay && !isExternallyControlled;
	const [phase, setPhase] = useState<PrecisionFlowPhase>(initialPhase);
	const [isPlaying, setIsPlaying] = useState(shouldAutoplay);
	const [hasStarted, setHasStarted] = useState(!shouldAutoplay);
	const [playbackCycle, setPlaybackCycle] = useState(0);
	const [playbackStartPhase, setPlaybackStartPhase] =
		useState<PrecisionFlowPhase>(initialPhase);
	const [isManuallyPaused, setIsManuallyPaused] = useState(false);
	const [replayCountdownSeconds, setReplayCountdownSeconds] = useState<
		number | null
	>(null);
	const [sectionRef, isVisible] = useViewportVisibility<HTMLDivElement>({
		threshold: 0.2,
		rootMargin: "40px",
	});
	const wasVisibilityPausedRef = useRef(false);

	const { schedule, reset: resetScheduler } = useAnimationScheduler({
		isPlaying,
	});

	const schedulePlaybackFromPhase = useCallback(
		(startPhase: PrecisionFlowPhase) => {
			resetScheduler();
			setPlaybackStartPhase(startPhase);
			setPlaybackCycle((value) => value + 1);
		},
		[resetScheduler]
	);

	const replay = useCallback(() => {
		const resetPhase = resetPrecisionFlowPlaybackState().phase;

		resetScheduler();
		setPhase(resetPhase);
		setPlaybackStartPhase(resetPhase);
		setHasStarted(true);
		setIsPlaying(true);
		setIsManuallyPaused(false);
		setReplayCountdownSeconds(null);
		setPlaybackCycle((value) => value + 1);
	}, [resetScheduler]);

	const resume = useCallback(() => {
		setHasStarted(true);
		setIsPlaying(true);
		setIsManuallyPaused(false);
		setReplayCountdownSeconds(null);
		schedulePlaybackFromPhase(phase);
	}, [phase, schedulePlaybackFromPhase]);

	const jumpToStep = useCallback(
		(stepId: PrecisionFlowStepId) => {
			const targetPhase = getPrecisionFlowStartPhaseForStep(stepId);

			resetScheduler();
			setPhase(targetPhase);
			setPlaybackStartPhase(targetPhase);
			setHasStarted(true);
			setIsPlaying(false);
			setIsManuallyPaused(true);
			setReplayCountdownSeconds(null);
		},
		[resetScheduler]
	);

	const handleClarifyCursorClick = useCallback(() => {
		setPhase((currentPhase) =>
			currentPhase === "clarify_click" ? "question_one" : currentPhase
		);
	}, []);

	const handleQuestionOneNextCursorClick = useCallback(() => {
		setPhase((currentPhase) =>
			currentPhase === "question_one_next_click" ? "question_two" : currentPhase
		);
	}, []);

	const handleApproveCursorClick = useCallback(() => {
		setPhase((currentPhase) =>
			currentPhase === "approve_click" ? "faq_created" : currentPhase
		);
	}, []);

	const handleAnswerSelectCursorClick = useCallback(() => {
		setPhase((currentPhase) =>
			currentPhase === "question_two_select" ? "analyzing" : currentPhase
		);
	}, []);

	useEffect(() => {
		if (!autoplay || isManuallyPaused || isExternallyControlled) {
			return;
		}

		if (!isVisible) {
			if (isPlaying) {
				wasVisibilityPausedRef.current = true;
				setIsPlaying(false);
			}
			return;
		}

		if (!hasStarted) {
			setPhase(initialPhase);
			setPlaybackStartPhase(initialPhase);
			setHasStarted(true);
			setIsPlaying(true);
			setPlaybackCycle((value) => value + 1);
			return;
		}

		if (wasVisibilityPausedRef.current && !isPlaying) {
			wasVisibilityPausedRef.current = false;
			setIsPlaying(true);
		}
	}, [
		autoplay,
		hasStarted,
		initialPhase,
		isExternallyControlled,
		isManuallyPaused,
		isPlaying,
		isVisible,
	]);

	useEffect(() => {
		if (!externalPlayback) {
			return;
		}

		resetScheduler();
		setPhase(initialPhase);
		setPlaybackStartPhase(initialPhase);
		setHasStarted(false);
		setIsPlaying(false);
		setIsManuallyPaused(false);
		setReplayCountdownSeconds(null);
		wasVisibilityPausedRef.current = false;
	}, [externalPlayback?.resetToken, initialPhase, resetScheduler]);

	useEffect(() => {
		if (!externalPlayback || externalPlayback.isPlaying) {
			return;
		}

		setIsPlaying(false);
		setIsManuallyPaused(hasStarted);
		setReplayCountdownSeconds(null);
	}, [externalPlayback?.isPlaying, hasStarted]);

	useEffect(() => {
		if (!externalPlayback?.isPlaying) {
			return;
		}

		if (!hasStarted) {
			setHasStarted(true);
			setIsPlaying(true);
			setIsManuallyPaused(false);
			setReplayCountdownSeconds(null);
			schedulePlaybackFromPhase(phase);
			return;
		}

		setIsPlaying(true);
		setIsManuallyPaused(false);
		setReplayCountdownSeconds(null);
	}, [
		externalPlayback?.isPlaying,
		externalPlayback?.playToken,
		hasStarted,
		phase,
		schedulePlaybackFromPhase,
	]);

	useEffect(() => {
		if (!hasStarted || isManuallyPaused) {
			return;
		}

		for (const entry of getPrecisionFlowRemainingSequence(playbackStartPhase)) {
			schedule(entry.delayMs, () => {
				setPhase(entry.phase);
			});
		}
	}, [
		hasStarted,
		isManuallyPaused,
		playbackCycle,
		playbackStartPhase,
		schedule,
	]);

	useEffect(() => {
		if (
			!(
				autoplay &&
				!isExternallyControlled &&
				phase === "faq_created" &&
				!isManuallyPaused
			)
		) {
			setReplayCountdownSeconds(null);
			return;
		}

		setReplayCountdownSeconds(
			(currentValue) => currentValue ?? PRECISION_FLOW_AUTOREPLAY_SECONDS
		);
	}, [autoplay, isExternallyControlled, isManuallyPaused, phase]);

	useEffect(() => {
		if (
			!(autoplay && !isExternallyControlled && isVisible) ||
			isManuallyPaused ||
			phase !== "faq_created" ||
			replayCountdownSeconds === null
		) {
			return;
		}

		const timeout = window.setTimeout(() => {
			if (replayCountdownSeconds <= 1) {
				replay();
				return;
			}

			setReplayCountdownSeconds((currentValue) =>
				currentValue === null ? null : currentValue - 1
			);
		}, 1000);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [
		autoplay,
		isExternallyControlled,
		isManuallyPaused,
		isVisible,
		phase,
		replay,
		replayCountdownSeconds,
	]);

	return {
		handleAnswerSelectCursorClick,
		handleApproveCursorClick,
		handleClarifyCursorClick,
		handleQuestionOneNextCursorClick,
		isManuallyPaused,
		jumpToStep,
		phase,
		replay,
		replayCountdownSeconds,
		resume,
		sectionRef,
	};
}

export function PrecisionFlowPlaybackProvider({
	initialPhase,
	autoplay,
	className,
	children,
	externalPlayback,
}: PrecisionFlowPlaybackProviderProps) {
	const playback = usePrecisionFlowPlayback({
		initialPhase,
		autoplay,
		externalPlayback,
	});
	const [composerVisibility, setComposerVisibility] =
		useState<MessageVisibility>("public");
	const scene = useMemo(
		() => buildPrecisionFlowScene(playback.phase),
		[playback.phase]
	);

	useEffect(() => {
		if (playback.phase === PRECISION_FLOW_INITIAL_PHASE) {
			setComposerVisibility("public");
		}
	}, [playback.phase]);

	return (
		<PrecisionFlowPlaybackContext.Provider
			value={{
				...playback,
				scene,
				composerVisibility,
				setComposerVisibility,
			}}
		>
			<div className={className} ref={playback.sectionRef}>
				{children}
			</div>
		</PrecisionFlowPlaybackContext.Provider>
	);
}

export function PrecisionFlowPlaybackControls() {
	const {
		isManuallyPaused,
		jumpToStep,
		replay,
		replayCountdownSeconds,
		resume,
		scene,
	} = usePrecisionFlowPlaybackContext();
	const replayButtonLabel = getPrecisionFlowReplayButtonLabel({
		isManuallyPaused,
		replayCountdownSeconds,
	});
	const primaryActionPresentation = getPrecisionFlowPrimaryActionPresentation({
		isManuallyPaused,
		replayCountdownSeconds,
	});
	const handlePrimaryActionClick = isManuallyPaused ? resume : replay;

	return (
		<>
			<div className="grid gap-3">
				{PRECISION_FLOW_STEPS.map((step, index) => {
					const isActive = step.id === scene.activeStepId;

					return (
						<button
							className={cn(
								"w-full py-4 text-left transition-colors",
								isActive ? "text-primary" : "text-primary/70"
							)}
							data-active={isActive ? "true" : "false"}
							data-precision-step={step.id}
							key={step.id}
							onClick={() => jumpToStep(step.id)}
							type="button"
						>
							<div className="flex items-start gap-4">
								<div
									className={cn(
										"flex shrink-0 items-center justify-center font-medium text-sm",
										isActive ? "text-plasma-orange" : "text-primary/60"
									)}
								>
									[0{index + 1}]
								</div>
								<div className="space-y-1">
									<div className="font-medium text-sm">{step.label}</div>
									<p className="text-sm">{step.description}</p>
								</div>
							</div>
						</button>
					);
				})}
			</div>

			<div className="flex items-center gap-3">
				<Button
					data-precision-primary-action-icon={
						isManuallyPaused ? "play" : "replay"
					}
					onClick={handlePrimaryActionClick}
					size="xs"
					type="button"
					variant={primaryActionPresentation.variant}
				>
					<primaryActionPresentation.icon className="size-4" />
					{replayButtonLabel}
				</Button>
			</div>
		</>
	);
}

export function PrecisionFlowPlaybackStage() {
	const {
		composerVisibility,
		handleAnswerSelectCursorClick,
		handleApproveCursorClick,
		handleClarifyCursorClick,
		handleQuestionOneNextCursorClick,
		phase,
		scene,
		setComposerVisibility,
	} = usePrecisionFlowPlaybackContext();
	const isClarifyTransition = phase === "clarify_transition";
	const showComposer = !(
		phase === "visitor_question" ||
		phase === "gap_search_loading" ||
		phase === "gap_search_result" ||
		phase === "human_handoff" ||
		phase === "faq_created"
	);
	const showTimeline =
		phase === "visitor_question" ||
		phase === "gap_search_loading" ||
		phase === "gap_search_result" ||
		phase === "human_handoff" ||
		phase === "clarify_transition";
	const showOpeningMessageRadial =
		phase === "visitor_question" ||
		phase === "gap_search_loading" ||
		phase === "gap_search_result" ||
		phase === "human_handoff";

	return (
		<PrecisionFlowRightPanel
			showOpeningMessageRadial={showOpeningMessageRadial}
		>
			{phase === "faq_created" ? (
				<PrecisionFlowFaqCreatedCard draft={scene.faqDraft} />
			) : (
				<PrecisionFlowConversationStage
					composerState={scene.composerState}
					composerValue={scene.composerValue}
					isClarifyTransition={isClarifyTransition}
					onAnswerSelectCursorClick={handleAnswerSelectCursorClick}
					onApproveCursorClick={handleApproveCursorClick}
					onClarifyCursorClick={handleClarifyCursorClick}
					onQuestionOneNextCursorClick={handleQuestionOneNextCursorClick}
					onVisibilityChange={setComposerVisibility}
					showAnswerSelectCursor={scene.showAnswerSelectCursor}
					showApproveCursor={scene.showApproveCursor}
					showClarifyCursor={scene.showClarifyCursor}
					showComposer={showComposer}
					showQuestionOneNextCursor={scene.showQuestionOneNextCursor}
					showTimeline={showTimeline}
					timelineItems={scene.timelineItems}
					topicSummary={scene.topicSummary}
					visibility={composerVisibility}
				/>
			)}
		</PrecisionFlowRightPanel>
	);
}
