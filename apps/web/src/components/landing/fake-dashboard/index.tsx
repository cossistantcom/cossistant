"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useViewportVisibility } from "@/hooks/use-viewport-visibility";
import { cn } from "@/lib/utils";
import {
	type LandingAnimationView,
	useLandingAnimationStore,
} from "@/stores/landing-animation-store";
import type { FakeDashboardScenarioId } from "./data";
import { FakeConversation } from "./fake-conversation";
import { useFakeConversation } from "./fake-conversation/use-fake-conversation";
import { FakeInbox } from "./fake-inbox";
import { useFakeInbox } from "./fake-inbox/use-fake-inbox";
import { FakeCentralContainer } from "./fake-layout";
import { FakeNavigationTopbar } from "./fake-navigation-topbar";
import "./fake-dashboard.css";

type FakeDashboardProps = {
	className?: string;
	scenario?: FakeDashboardScenarioId;
	externalPlayback?: {
		initialView?: LandingAnimationView;
		isPlaying: boolean;
		playToken: number;
		resetToken: number;
	};
};

export function FakeDashboard({
	className,
	scenario = "landing_escalation",
	externalPlayback,
}: FakeDashboardProps) {
	const isExternallyControlled = externalPlayback !== undefined;
	const externalInitialView = externalPlayback?.initialView ?? "inbox";
	const currentView = useLandingAnimationStore((state) => state.currentView);
	const isPlaying = useLandingAnimationStore((state) => state.isPlaying);
	const isRestarting = useLandingAnimationStore((state) => state.isRestarting);
	const onAnimationComplete = useLandingAnimationStore(
		(state) => state.onAnimationComplete
	);
	const play = useLandingAnimationStore((state) => state.play);
	const pause = useLandingAnimationStore((state) => state.pause);
	const reset = useLandingAnimationStore((state) => state.reset);
	const selectView = useLandingAnimationStore((state) => state.selectView);
	const previousViewRef = useRef<typeof currentView>(currentView);
	const wasVisibilityPausedRef = useRef(false);
	const [showInboxMouseCursor, setShowInboxMouseCursor] = useState(false);
	const [showJoinMouseCursor, setShowJoinMouseCursor] = useState(false);
	const [dashboardRef, isVisible] = useViewportVisibility<HTMLDivElement>({
		threshold: 0.1,
		rootMargin: "50px",
	});
	const isAnimationActive = isExternallyControlled
		? Boolean(externalPlayback?.isPlaying && isPlaying)
		: isVisible && isPlaying;

	useEffect(() => {
		if (isExternallyControlled) {
			return;
		}

		if (!isVisible && isPlaying) {
			wasVisibilityPausedRef.current = true;
			pause();
			return;
		}

		if (
			isVisible &&
			wasVisibilityPausedRef.current &&
			!isPlaying &&
			currentView !== null
		) {
			wasVisibilityPausedRef.current = false;
			selectView(currentView);
		}
	}, [
		currentView,
		isExternallyControlled,
		isPlaying,
		isVisible,
		pause,
		selectView,
	]);

	useEffect(() => {
		if (isExternallyControlled) {
			return;
		}

		reset();
		const timeout = setTimeout(() => {
			selectView("inbox");
		}, 200);
		return () => clearTimeout(timeout);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isExternallyControlled, reset, selectView]);

	const handleInboxMouseClick = useCallback(() => {
		setShowInboxMouseCursor(false);
		setTimeout(() => {
			selectView("conversation");
		}, 100);
	}, [selectView]);

	const handleShowInboxMouseCursor = useCallback(() => {
		setShowInboxMouseCursor(true);
	}, []);

	const handleShowJoinMouseCursor = useCallback(() => {
		setShowJoinMouseCursor(true);
	}, []);

	const handleAnimationComplete = useCallback(() => {
		onAnimationComplete();
	}, [onAnimationComplete]);

	const inboxHook = useFakeInbox({
		isPlaying: isAnimationActive && currentView === "inbox",
		onComplete: undefined,
		onShowMouseCursor:
			currentView === "inbox" ? handleShowInboxMouseCursor : undefined,
		scenario,
	});

	const conversationHook = useFakeConversation({
		isPlaying: isAnimationActive && currentView === "conversation",
		onComplete:
			currentView === "conversation" ? handleAnimationComplete : undefined,
		onConversationHandled: inboxHook.markConversationHandledByHuman,
		onShowJoinCursor:
			currentView === "conversation" ? handleShowJoinMouseCursor : undefined,
		scenario,
	});

	const handleJoinMouseClick = useCallback(() => {
		setShowJoinMouseCursor(false);
		conversationHook.joinEscalation();
	}, [conversationHook.joinEscalation]);

	useEffect(() => {
		if (isExternallyControlled) {
			return;
		}

		if (!isRestarting) {
			return;
		}

		inboxHook.resetDemoData();
		conversationHook.resetDemoData();
		setShowInboxMouseCursor(false);
		setShowJoinMouseCursor(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		conversationHook.resetDemoData,
		inboxHook.resetDemoData,
		isExternallyControlled,
		isRestarting,
	]);

	useEffect(() => {
		if (!externalPlayback) {
			return;
		}

		inboxHook.resetDemoData();
		conversationHook.resetDemoData();
		setShowInboxMouseCursor(false);
		setShowJoinMouseCursor(false);
		reset();
		if (externalInitialView !== "inbox") {
			selectView(externalInitialView);
		}
		pause();
		wasVisibilityPausedRef.current = false;
	}, [
		conversationHook.resetDemoData,
		externalInitialView,
		externalPlayback?.resetToken,
		inboxHook.resetDemoData,
		pause,
		reset,
		selectView,
	]);

	useEffect(() => {
		if (externalPlayback?.isPlaying !== false) {
			return;
		}

		pause();
	}, [externalPlayback?.isPlaying, pause]);

	useEffect(() => {
		if (externalPlayback?.isPlaying !== true) {
			return;
		}

		play();
	}, [externalPlayback?.isPlaying, externalPlayback?.playToken, play]);

	useEffect(() => {
		if (
			previousViewRef.current !== null &&
			previousViewRef.current !== currentView
		) {
			setShowInboxMouseCursor(false);
			setShowJoinMouseCursor(false);
		}

		previousViewRef.current = currentView;
	}, [currentView]);

	return (
		<div
			className={cn(
				"@container relative flex h-full w-full flex-col overflow-hidden bg-background-100 dark:bg-background",
				className
			)}
			data-fake-dashboard-scenario={scenario}
			ref={dashboardRef}
		>
			<FakeNavigationTopbar />
			<FakeCentralContainer>
				{currentView === "inbox" ? (
					<FakeInbox
						conversations={inboxHook.conversations}
						onMouseClick={handleInboxMouseClick}
						showMouseCursor={showInboxMouseCursor}
					/>
				) : (
					<FakeConversation
						composerValue={conversationHook.composerValue}
						composerVisibility={conversationHook.composerVisibility}
						conversation={conversationHook.conversation}
						isComposerTyping={conversationHook.isComposerTyping}
						isEscalationPending={conversationHook.isEscalationPending}
						onComposerVisibilityChange={
							conversationHook.onComposerVisibilityChange
						}
						onJoinConversation={conversationHook.joinEscalation}
						onJoinCursorClick={handleJoinMouseClick}
						showJoinCursor={showJoinMouseCursor}
						timeline={conversationHook.timelineItems}
						typingActors={conversationHook.typingActors}
						visitor={conversationHook.visitor}
					/>
				)}
			</FakeCentralContainer>
		</div>
	);
}
