"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRECISION_FLOW_INITIAL_PHASE } from "@/app/(lander-docs)/components/precision-flow-demo";
import {
	PrecisionFlowPlaybackProvider,
	PrecisionFlowPlaybackStage,
} from "@/app/(lander-docs)/components/precision-flow-playback";
import { FakeDashboard } from "@/components/landing/fake-dashboard";
import { FakeMouseCursor } from "@/components/landing/fake-dashboard/fake-inbox/fake-mouse-cursor";
import { FakeBubble } from "@/components/landing/fake-support-widget/fake-bubble";
import { FakeHomePage } from "@/components/landing/fake-support-widget/fake-home-page";
import { FakeSupportProvider } from "@/components/landing/fake-support-widget/fake-support-context";
import { FakeSupportStoreProvider } from "@/components/landing/fake-support-widget/fake-support-store";
import { FakeSupportTextProvider } from "@/components/landing/fake-support-widget/fake-support-text";
import { BrowserShell } from "@/components/showcase/browser-shell";
import { WidgetShell } from "@/components/showcase/widget-shell";
import { Background } from "@/components/ui/background";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { LogoText, LogoTextSVG } from "@/components/ui/logo";
import { TextEffect } from "@/components/ui/text-effect";
import { useAnimationScheduler } from "@/hooks/use-animation-scheduler";
import { cn } from "@/lib/utils";
import {
	advancePromoBrowserIntroTyping,
	createPromoBrowserIntroPlaybackState,
	getPromoBrowserIntroTypedValue,
	PROMO_BROWSER_INTRO_APPEAR_DELAY_MS,
	PROMO_BROWSER_INTRO_CURSOR_CLICK_DELAY_MS,
	PROMO_BROWSER_INTRO_DOMAIN,
	PROMO_BROWSER_INTRO_TYPING_DELAY_MS,
	type PromoBrowserIntroPlaybackState,
	resetPromoBrowserIntroPlayback,
	startPromoBrowserIntroAppear,
	startPromoBrowserIntroCursor,
	startPromoBrowserIntroTyping,
} from "./promo-browser-intro";
import {
	createPromoLogoEndPlaybackState,
	type PromoLogoEndPlaybackState,
	resetPromoLogoEndPlayback,
	revealPromoLogoEnd,
} from "./promo-logo-end";
import {
	INITIAL_PROMO_PLAYBACK_STATE,
	type PromoSceneId,
	pausePromoPlayback,
	playPromoPlayback,
	resetPromoPlayback,
	selectPromoScene,
} from "./promo-video-model";

type PromoSceneDefinition = {
	id: PromoSceneId;
	label: string;
};

type PromoSceneControls = {
	isPlaying: boolean;
	playToken: number;
	resetToken: number;
};

const PROMO_WIDGET_OPEN_DELAY_MS = 420;
const PROMO_SCENES: PromoSceneDefinition[] = [
	{ id: "browser_intro", label: "Browser intro" },
	{ id: "precision_flow", label: "Clarification flow" },
	{ id: "widget_open", label: "Widget open" },
	{ id: "fake_dashboard", label: "Fake dashboard" },
	{ id: "logo_end", label: "End logo" },
];

export function PromoBrowserIntroScene({
	isPlaying,
	resetToken,
}: PromoSceneControls) {
	const [playbackState, setPlaybackState] =
		useState<PromoBrowserIntroPlaybackState>(
			createPromoBrowserIntroPlaybackState
		);
	const sceneRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLDivElement>(null);
	const hasScheduledRef = useRef(false);
	const scheduleRef = useRef<
		((timeMs: number, callback: () => void) => () => void) | null
	>(null);

	const { schedule, reset: resetScheduler } = useAnimationScheduler({
		isPlaying,
	});

	scheduleRef.current = schedule;

	useEffect(() => {
		scheduleRef.current = schedule;
	}, [schedule]);

	const resetScene = useCallback(() => {
		setPlaybackState(resetPromoBrowserIntroPlayback());
		resetScheduler();
		hasScheduledRef.current = false;
	}, [resetScheduler]);

	useEffect(() => {
		resetScene();
	}, [resetScene, resetToken]);

	useEffect(() => {
		if (!isPlaying || hasScheduledRef.current) {
			return;
		}

		const scheduleTasks = () => {
			const currentSchedule = scheduleRef.current;
			if (!currentSchedule) {
				window.setTimeout(scheduleTasks, 10);
				return;
			}

			hasScheduledRef.current = true;

			currentSchedule(0, () => {
				setPlaybackState(startPromoBrowserIntroAppear());
			});

			currentSchedule(PROMO_BROWSER_INTRO_APPEAR_DELAY_MS, () => {
				setPlaybackState(startPromoBrowserIntroCursor());
			});

			currentSchedule(
				PROMO_BROWSER_INTRO_APPEAR_DELAY_MS +
					PROMO_BROWSER_INTRO_CURSOR_CLICK_DELAY_MS,
				() => {
					setPlaybackState((currentState) =>
						startPromoBrowserIntroTyping(currentState)
					);
				}
			);

			for (
				let characterIndex = 1;
				characterIndex <= PROMO_BROWSER_INTRO_DOMAIN.length;
				characterIndex += 1
			) {
				currentSchedule(
					PROMO_BROWSER_INTRO_APPEAR_DELAY_MS +
						PROMO_BROWSER_INTRO_CURSOR_CLICK_DELAY_MS +
						characterIndex * PROMO_BROWSER_INTRO_TYPING_DELAY_MS,
					() => {
						setPlaybackState((currentState) =>
							advancePromoBrowserIntroTyping(currentState)
						);
					}
				);
			}
		};

		scheduleTasks();
	}, [isPlaying]);

	const isCursorVisible = playbackState.phase === "cursor_enter";
	const isFocused =
		playbackState.phase === "typing" || playbackState.phase === "complete";
	const isInputVisible = playbackState.phase !== "hidden";
	const shouldRenderTypedValue =
		playbackState.phase === "typing" || playbackState.phase === "complete";
	const typedValue = getPromoBrowserIntroTypedValue(playbackState);

	return (
		<div
			className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background-50 p-6"
			data-promo-browser-intro="true"
			data-promo-browser-intro-phase={playbackState.phase}
			data-promo-scene="browser_intro"
			ref={sceneRef}
		>
			<Background
				accentColorVar="--primary"
				className="pointer-events-none absolute inset-0"
				fieldOpacity={0.08}
				interactive={false}
				pointerTrail={false}
			/>
			<div className="relative z-10 flex w-full justify-center px-8">
				<motion.div
					animate={
						isInputVisible
							? { opacity: 1, y: 0, scale: 1 }
							: { opacity: 0, y: 56, scale: 0.96 }
					}
					className={cn(
						"flex min-h-24 w-full max-w-[860px] items-center rounded-[16px] border bg-background/94 px-10 py-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur md:min-h-28 md:px-12 dark:shadow-[0_26px_72px_rgba(0,0,0,0.48),0_0_0_1px_rgba(255,255,255,0.03)]",
						isFocused
							? "border-primary/35 shadow-[0_22px_64px_rgba(15,23,42,0.12)] dark:shadow-[0_30px_80px_rgba(0,0,0,0.58),0_0_0_1px_rgba(255,255,255,0.05)]"
							: "border-primary/12"
					)}
					data-promo-browser-input="true"
					data-promo-browser-input-state={playbackState.phase}
					initial={false}
					ref={inputRef}
					transition={{
						damping: 18,
						mass: 0.9,
						stiffness: 180,
						type: "spring",
					}}
				>
					<div
						className="w-full overflow-hidden font-mono text-3xl text-primary leading-none tracking-[-0.04em] md:text-[56px]"
						data-promo-browser-input-value-state={
							typedValue.length > 0 ? "filled" : "empty"
						}
					>
						{shouldRenderTypedValue ? (
							<TextEffect
								as="div"
								caretClassName="bg-primary"
								className="inline-block whitespace-pre"
								per="char"
								revealedCount={playbackState.typedLength}
								showCaret={true}
							>
								{PROMO_BROWSER_INTRO_DOMAIN}
							</TextEffect>
						) : (
							<div aria-hidden="true" className="h-[1em] w-full" />
						)}
					</div>
				</motion.div>
			</div>
			<FakeMouseCursor
				className="bg-primary"
				containerRef={sceneRef}
				isVisible={isCursorVisible}
				onClick={() => {}}
				targetElementRef={inputRef}
				targetMode="element"
			/>
		</div>
	);
}

export function PromoPrecisionFlowScene({
	isPlaying,
	playToken,
	resetToken,
}: PromoSceneControls) {
	return (
		<div
			className="h-full w-full bg-background"
			data-promo-precision-stage="true"
			data-promo-scene="precision_flow"
		>
			<PrecisionFlowPlaybackProvider
				autoplay={false}
				className="h-full"
				externalPlayback={{
					isPlaying,
					playToken,
					resetToken,
				}}
				initialPhase={PRECISION_FLOW_INITIAL_PHASE}
			>
				<div className="h-full w-full">
					<PrecisionFlowPlaybackStage />
				</div>
			</PrecisionFlowPlaybackProvider>
		</div>
	);
}

function PromoWidgetOpenScene({
	isPlaying,
	playToken,
	resetToken,
}: PromoSceneControls) {
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		setIsOpen(false);
	}, [resetToken]);

	useEffect(() => {
		if (!isPlaying || isOpen) {
			return;
		}

		const timeout = window.setTimeout(() => {
			setIsOpen(true);
		}, PROMO_WIDGET_OPEN_DELAY_MS);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [isOpen, isPlaying, playToken]);

	return (
		<div
			className="relative flex h-full w-full items-end justify-end overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,244,245,0.95))] p-8 dark:bg-[linear-gradient(180deg,rgba(23,23,23,0.98),rgba(10,10,10,0.96))]"
			data-promo-scene="widget_open"
		>
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_36%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_36%)]" />
			<div className="absolute top-8 left-8 max-w-md rounded-[2px] border border-primary/10 border-dashed bg-background/70 px-4 py-3 text-primary/70 text-sm shadow-sm backdrop-blur">
				The widget scene starts closed, then opens into the real fake home page
				shell when you press play.
			</div>
			<div
				className="relative z-10"
				data-promo-widget-state={isOpen ? "open" : "closed"}
			>
				{isOpen ? (
					<FakeSupportProvider>
						<FakeSupportTextProvider>
							<FakeSupportStoreProvider
								conversationId="01JGPROMOWIDGETOPEN0000001"
								initialPage="HOME"
							>
								<WidgetShell
									bubble={<FakeBubble className="opacity-95" isOpen={true} />}
									frameClassName="h-[520px] min-h-[520px] w-[360px]"
								>
									<div
										className="relative flex h-full flex-col bg-co-background"
										data-promo-widget-frame="true"
									>
										<FakeHomePage onStartConversation={() => {}} />
									</div>
								</WidgetShell>
							</FakeSupportStoreProvider>
						</FakeSupportTextProvider>
					</FakeSupportProvider>
				) : (
					<div className="flex items-end justify-end">
						<FakeBubble className="shadow-lg" isOpen={false} />
					</div>
				)}
			</div>
		</div>
	);
}

export function PromoDashboardScene({
	isPlaying,
	playToken,
	resetToken,
}: PromoSceneControls) {
	return (
		<div
			className="flex h-full w-full items-center justify-center bg-background-50 p-6"
			data-promo-dashboard-scenario="promo_delete_account_answered"
			data-promo-scene="fake_dashboard"
		>
			<BrowserShell
				chromeUrl="https://app.cossistant.com/inbox"
				className="fake-browser-wrapper h-full w-full max-w-[1180px]"
				contentClassName="bg-background"
			>
				<div className="fake-dashboard-container">
					<FakeDashboard
						externalPlayback={{
							initialView: "inbox",
							isPlaying,
							playToken,
							resetToken,
						}}
						scenario="promo_delete_account_answered"
					/>
				</div>
			</BrowserShell>
		</div>
	);
}

export function PromoLogoEndScene({
	isPlaying,
	playToken,
	resetToken,
}: PromoSceneControls) {
	const [playbackState, setPlaybackState] = useState<PromoLogoEndPlaybackState>(
		createPromoLogoEndPlaybackState
	);

	useEffect(() => {
		setPlaybackState(resetPromoLogoEndPlayback());
	}, [resetToken]);

	useEffect(() => {
		if (!isPlaying) {
			return;
		}

		setPlaybackState(revealPromoLogoEnd());
	}, [isPlaying, playToken]);

	return (
		<div
			className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background"
			data-promo-logo-end-scene="true"
			data-promo-logo-end-state={playbackState.isVisible ? "visible" : "hidden"}
			data-promo-scene="logo_end"
		>
			<Background
				accentColorVar="--primary"
				className="pointer-events-none absolute inset-0"
				fieldOpacity={0.08}
				interactive={false}
				pointerTrail={false}
			/>
			<div className="relative z-10 flex w-full items-center justify-center px-8">
				<AnimatePresence initial={false}>
					{playbackState.isVisible ? (
						<motion.div
							animate={{ opacity: 1, scale: 1, y: 0 }}
							className="flex w-full justify-center"
							data-promo-logo-end-mark="true"
							exit={{ opacity: 0, scale: 0.98, y: 12 }}
							initial={{ opacity: 0, scale: 0.96, y: 48 }}
							key="promo-logo-end-visible"
							transition={{
								damping: 18,
								mass: 0.95,
								stiffness: 180,
								type: "spring",
							}}
						>
							<LogoTextSVG
								className="w-[min(78%,980px)] text-primary"
								eyeFill="var(--background)"
							/>
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		</div>
	);
}

function PromoSceneStage({
	selectedSceneId,
	controls,
}: {
	selectedSceneId: PromoSceneId;
	controls: PromoSceneControls;
}) {
	switch (selectedSceneId) {
		case "precision_flow":
			return <PromoPrecisionFlowScene {...controls} />;
		case "widget_open":
			return <PromoWidgetOpenScene {...controls} />;
		case "fake_dashboard":
			return <PromoDashboardScene {...controls} />;
		case "logo_end":
			return <PromoLogoEndScene {...controls} />;
		case "browser_intro":
			return <PromoBrowserIntroScene {...controls} />;
		default: {
			const exhaustiveCheck: never = selectedSceneId;
			throw new Error(`Unhandled promo scene: ${String(exhaustiveCheck)}`);
		}
	}
}

export function PromoVideoPage() {
	const [playbackState, setPlaybackState] = useState(
		INITIAL_PROMO_PLAYBACK_STATE
	);

	const handleSceneSelect = (sceneId: PromoSceneId) => {
		setPlaybackState((currentValue) => selectPromoScene(currentValue, sceneId));
	};

	const handlePlay = () => {
		setPlaybackState((currentValue) => playPromoPlayback(currentValue));
	};

	const handlePause = () => {
		setPlaybackState((currentValue) => pausePromoPlayback(currentValue));
	};

	const handleReset = () => {
		setPlaybackState((currentValue) => resetPromoPlayback(currentValue));
	};

	return (
		<div
			className="min-h-screen bg-background px-4 py-8 md:px-8"
			data-promo-video-page="true"
		>
			<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
				<div className="flex flex-col gap-4" data-promo-video-toolbar="true">
					<div className="flex flex-wrap items-center gap-3">
						<LogoText />
						<span className="font-medium font-mono text-primary/60 text-xs uppercase tracking-[0.22em]">
							promo video sandbox
						</span>
					</div>

					<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
						<div className="flex flex-wrap gap-2">
							{PROMO_SCENES.map((scene) => (
								<Button
									aria-pressed={scene.id === playbackState.selectedSceneId}
									data-promo-scene-button={scene.id}
									key={scene.id}
									onClick={() => handleSceneSelect(scene.id)}
									size="sm"
									type="button"
									variant={
										scene.id === playbackState.selectedSceneId
											? "default"
											: "outline"
									}
								>
									{scene.label}
								</Button>
							))}
						</div>

						<div className="flex flex-wrap gap-2">
							<Button
								data-promo-playback-action={
									playbackState.isPlaying ? "pause" : "play"
								}
								onClick={playbackState.isPlaying ? handlePause : handlePlay}
								size="sm"
								type="button"
							>
								<Icon name={playbackState.isPlaying ? "pause" : "play"} />
								{playbackState.isPlaying ? "Pause" : "Play"}
							</Button>
							<Button
								data-promo-playback-action="reset"
								onClick={handleReset}
								size="sm"
								type="button"
								variant="outline"
							>
								Reset
							</Button>
						</div>
					</div>
				</div>

				<div
					className="overflow-hidden rounded-[2px] border-2 border-red-500 bg-background shadow-2xl"
					data-promo-video-frame="true"
				>
					<div className="aspect-video w-full">
						<PromoSceneStage
							controls={{
								isPlaying: playbackState.isPlaying,
								playToken: playbackState.playToken,
								resetToken: playbackState.resetToken,
							}}
							selectedSceneId={playbackState.selectedSceneId}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
