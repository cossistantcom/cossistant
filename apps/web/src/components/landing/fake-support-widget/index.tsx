"use client";

import * as Primitive from "@plasma/react/primitives";
import { AvatarStack } from "@plasma/react/support/components/avatar-stack";
import { CoButton as Button } from "@plasma/react/support/components/button";
import { ConversationResolvedFeedback } from "@plasma/react/support/components/conversation-resolved-feedback";
import Icon from "@plasma/react/support/components/icons";
import { Watermark } from "@plasma/react/support/components/watermark";
// Text component uses real hooks, so we'll create a simple fake version
import { ConversationStatus } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { useCallback, useEffect, useRef, useState } from "react";
import { WidgetShell } from "@/components/showcase/widget-shell";
import { useViewportVisibility } from "@/hooks/use-viewport-visibility";
import { cn } from "@/lib/utils";
import { useWidgetAnimationStore } from "@/stores/widget-animation-store";
import { FakeBubble } from "./fake-bubble";
import { FakeConversationTimelineList } from "./fake-conversation-timeline-list";
import { FakeHomePage } from "./fake-home-page";
import { FakeSupportProvider, useFakeSupport } from "./fake-support-context";
import {
	FakeSupportStoreProvider,
	useFakeSupportConfig,
} from "./fake-support-store";
import { FakeSupportTextProvider, useSupportText } from "./fake-support-text";
import { FakeWidgetMouseCursor } from "./fake-widget-mouse-cursor";
import type { FakeSupportTypingActor } from "./types";
import { useFakeSupportWidgetConversation } from "./use-fake-support-widget-conversation";
import { useFakeSupportWidgetHome } from "./use-fake-support-widget-home";

/**
 * Fake Header component that mimics the real Header but uses fake hooks
 */
function FakeHeader({
	children,
	onGoBack,
}: {
	children: React.ReactNode;
	onGoBack?: () => void;
}) {
	const { close } = useFakeSupportConfig();

	return (
		<div className="absolute inset-x-0 top-0 z-10 flex h-18 items-center justify-between gap-3 bg-co-background px-4">
			<div className="flex flex-1 items-center gap-3">
				{onGoBack && (
					<Button onClick={onGoBack} size="icon" type="button" variant="ghost">
						<Icon name="arrow-left" />
					</Button>
				)}
				{children}
			</div>
			<Button onClick={close} size="icon" type="button" variant="ghost">
				<Icon name="close" />
			</Button>
		</div>
	);
}

/**
 * Fake conversation view that manually renders the conversation structure
 * using real components but with fake hooks/data.
 */
function FakeConversationView({
	conversationId,
	timelineItems,
	typingActors,
	isConversationClosed,
}: {
	conversationId: string;
	timelineItems: TimelineItem[];
	typingActors: FakeSupportTypingActor[];
	isConversationClosed: boolean;
}) {
	const { website, availableAIAgents, availableHumanAgents, visitor } =
		useFakeSupport();
	const text = useSupportText();
	const [message, setMessage] = useState("");
	const [rating, setRating] = useState<number | null>(null);

	const handleGoBack = () => {
		// Back button does nothing in fake demo
	};

	return (
		<div className="flex h-full flex-col gap-0 overflow-hidden">
			<FakeHeader onGoBack={handleGoBack}>
				<div className="flex w-full items-center justify-between gap-2 py-3">
					<div className="flex flex-col">
						<p className="font-medium text-sm">{website?.name}</p>
						<p className="text-muted-foreground text-sm">
							{text("common.labels.supportOnline")}
						</p>
					</div>
					<AvatarStack
						aiAgents={availableAIAgents}
						gapWidth={2}
						humanAgents={availableHumanAgents}
						size={32}
						spacing={28}
					/>
				</div>
			</FakeHeader>

			<div className="min-h-0 flex-1" style={{ scrollbarGutter: "stable" }}>
				<FakeConversationTimelineList
					availableAIAgents={availableAIAgents}
					availableHumanAgents={availableHumanAgents}
					className="px-4 py-20"
					conversationId={conversationId}
					currentVisitorId={visitor?.id}
					items={timelineItems}
					typingActors={typingActors}
				/>
			</div>

			{isConversationClosed ? (
				<div className="shrink-0">
					<ConversationResolvedFeedback
						onRate={(value) => setRating(value)}
						rating={rating}
						status={ConversationStatus.RESOLVED}
					/>
				</div>
			) : (
				<div className="shrink-0 p-1">
					<form className="flex flex-col gap-2">
						<div className="flex flex-col rounded border border-co-border/50 bg-co-background-100 dark:bg-co-background-200">
							<Primitive.MultimodalInput
								className={cn(
									"flex-1 resize-none overflow-hidden p-3 text-co-foreground text-sm placeholder:text-primary/40 focus-visible:outline-none"
								)}
								disabled={true}
								onChange={setMessage}
								placeholder={text("component.multimodalInput.placeholder")}
								value={message}
							/>
							<div className="flex items-center justify-between py-1 pr-1 pl-3">
								<Watermark />
								<div className="flex items-center gap-0.5">
									<button
										className="group flex h-8 w-8 items-center justify-center rounded-md text-co-muted-foreground hover:bg-co-muted hover:text-co-foreground disabled:cursor-not-allowed disabled:opacity-50"
										disabled={true}
										type="button"
									>
										<Icon className="h-4 w-4" name="send" />
									</button>
								</div>
							</div>
						</div>
					</form>
				</div>
			)}
		</div>
	);
}

/**
 * Main fake support widget component.
 *
 * Reuses real support components (Bubble, Container, Header, AvatarStack,
 * ConversationTimelineList, MultimodalInput) but provides fake data via
 * isolated fake providers.
 */
export function FakeSupportWidget({ className }: { className?: string }) {
	const currentView = useWidgetAnimationStore((state) => state.currentView);
	const isPlaying = useWidgetAnimationStore((state) => state.isPlaying);
	const isRestarting = useWidgetAnimationStore((state) => state.isRestarting);
	const onAnimationComplete = useWidgetAnimationStore(
		(state) => state.onAnimationComplete
	);
	const play = useWidgetAnimationStore((state) => state.play);
	const pause = useWidgetAnimationStore((state) => state.pause);
	const reset = useWidgetAnimationStore((state) => state.reset);
	const selectView = useWidgetAnimationStore((state) => state.selectView);
	const previousViewRef = useRef<typeof currentView>(currentView);
	const hasStartedRef = useRef(false);
	const wasVisibilityPausedRef = useRef(false);
	const visibilityStartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const [widgetRef, isVisible] = useViewportVisibility<HTMLDivElement>({
		threshold: 0.1,
		rootMargin: "50px",
	});
	const isAnimationActive = isVisible && isPlaying;

	// Reset to a paused baseline so the animation starts only after entering view.
	useEffect(() => {
		reset();
		pause();
		hasStartedRef.current = false;
		wasVisibilityPausedRef.current = false;
		if (visibilityStartTimeoutRef.current) {
			clearTimeout(visibilityStartTimeoutRef.current);
			visibilityStartTimeoutRef.current = null;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Start when visible, pause when hidden, and resume only after visibility pauses.
	useEffect(() => {
		if (!isVisible) {
			if (visibilityStartTimeoutRef.current) {
				clearTimeout(visibilityStartTimeoutRef.current);
				visibilityStartTimeoutRef.current = null;
			}
			if (isPlaying) {
				wasVisibilityPausedRef.current = true;
				pause();
			}
			return;
		}

		if (!hasStartedRef.current && currentView !== null) {
			if (visibilityStartTimeoutRef.current) {
				clearTimeout(visibilityStartTimeoutRef.current);
			}
			visibilityStartTimeoutRef.current = setTimeout(() => {
				hasStartedRef.current = true;
				play();
				visibilityStartTimeoutRef.current = null;
			}, 150);
			return;
		}

		if (
			hasStartedRef.current &&
			wasVisibilityPausedRef.current &&
			!isPlaying &&
			currentView !== null
		) {
			wasVisibilityPausedRef.current = false;
			play();
		}
	}, [isVisible, isPlaying, pause, play, currentView]);

	useEffect(
		() => () => {
			if (visibilityStartTimeoutRef.current) {
				clearTimeout(visibilityStartTimeoutRef.current);
			}
		},
		[]
	);

	const [showMouseCursor, setShowMouseCursor] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);

	const handleMouseClick = useCallback(() => {
		// Click triggers switch to conversation view
		setShowMouseCursor(false);
		// Small delay to ensure cursor animation completes before switching
		setTimeout(() => {
			selectView("conversation");
		}, 100);
	}, [selectView]);

	const handleShowMouseCursor = useCallback(() => {
		setShowMouseCursor(true);
	}, []);

	const handleNavigate = useCallback(
		(page: "HOME" | "CONVERSATION") => {
			if (page === "CONVERSATION") {
				selectView("conversation");
			} else {
				selectView("home");
			}
		},
		[selectView]
	);

	const homeHook = useFakeSupportWidgetHome({
		isPlaying: isAnimationActive && currentView === "home",
		onComplete: undefined, // Don't complete on home - mouse click handles transition
		onShowMouseCursor:
			currentView === "home" ? handleShowMouseCursor : undefined,
	});

	const conversationHook = useFakeSupportWidgetConversation({
		isPlaying: isAnimationActive && currentView === "conversation",
		onComplete:
			currentView === "conversation" ? onAnimationComplete : undefined,
	});

	const conversationId = "01JGAA2222222222222222222";

	// Reset animation data when restarting
	useEffect(() => {
		if (isRestarting) {
			// Reset all animation data when restart is triggered
			homeHook.resetDemoData();
			conversationHook.resetDemoData();
			setShowMouseCursor(false);
		}
		// Only depend on isRestarting - hook functions are stable
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isRestarting]);

	// Reset animation data when view changes
	useEffect(() => {
		const wasHome = previousViewRef.current === "home";
		const wasConversation = previousViewRef.current === "conversation";
		const isHome = currentView === "home";
		const isConversation = currentView === "conversation";

		// Only reset if we're actually switching views (not on initial mount)
		if (
			previousViewRef.current !== null &&
			previousViewRef.current !== currentView
		) {
			if (wasHome && isConversation) {
				// Switching from home to conversation - reset home
				homeHook.resetDemoData();
			} else if (wasConversation && isHome) {
				// Switching from conversation to home - reset conversation and ensure home can restart
				conversationHook.resetDemoData();
				// Explicitly reset home to ensure it can restart
				homeHook.resetDemoData();
				// Force home animation to restart by briefly pausing and playing
				if (isPlaying) {
					pause();
					setTimeout(() => {
						play();
					}, 50);
				}
			}
			// Reset mouse cursor when switching views
			setShowMouseCursor(false);
		}
		previousViewRef.current = currentView;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentView, isPlaying, play]);

	return (
		<div
			className={cn(
				"pointer-events-none flex h-full w-full items-center justify-center",
				className
			)}
			ref={widgetRef}
		>
			<FakeSupportProvider>
				<FakeSupportTextProvider>
					<FakeSupportStoreProvider
						conversationId={conversationId}
						initialPage={currentView === "home" ? "HOME" : "CONVERSATION"}
						onNavigate={handleNavigate}
					>
						<WidgetShell
							bubble={
								<FakeBubble
									className="opacity-90"
									isOpen={true}
									isTyping={false}
								/>
							}
							className="py-10"
							frameClassName="h-[620px] min-h-[620px] w-[420px]"
						>
							<div
								className="relative flex h-full flex-col"
								data-fake-widget-container="true"
							>
								{currentView === "home" ? (
									<div className="relative flex h-full w-full flex-col">
										<FakeHomePage
											onStartConversation={handleMouseClick}
											ref={buttonRef}
											showMouseCursor={showMouseCursor}
										/>
										{showMouseCursor && buttonRef.current && (
											<FakeWidgetMouseCursor
												isVisible={showMouseCursor}
												onClick={handleMouseClick}
												targetElementRef={buttonRef}
											/>
										)}
									</div>
								) : (
									<FakeConversationView
										conversationId={conversationId}
										isConversationClosed={conversationHook.isConversationClosed}
										timelineItems={
											conversationHook.timelineItems as TimelineItem[]
										}
										typingActors={conversationHook.typingActors}
									/>
								)}
							</div>
						</WidgetShell>
					</FakeSupportStoreProvider>
				</FakeSupportTextProvider>
			</FakeSupportProvider>
		</div>
	);
}
