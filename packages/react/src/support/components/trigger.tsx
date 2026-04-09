"use client";

import * as React from "react";
import { useNewMessageSound } from "../../hooks/use-new-message-sound";
import { useTransitionSwap } from "../../hooks/use-transition-swap";
import { useTypingSound } from "../../hooks/use-typing-sound";
import * as Primitive from "../../primitives";
import type { TriggerRenderProps } from "../types";
import { cn } from "../utils";
import Icon from "./icons";
import { BouncingDots } from "./typing-indicator";

type TriggerContentProps = {
	isOpen: boolean;
	unreadCount: number;
	isTyping: boolean;
};

const ICON_ROTATION = {
	chevron: { enter: "rotate(0deg)", exit: "rotate(-45deg)" },
	chat: { enter: "rotate(0deg)", exit: "rotate(45deg)" },
	typing: { enter: "rotate(0deg)", exit: "rotate(0deg)" },
} as const;

const TriggerContent: React.FC<TriggerContentProps> = ({
	isOpen,
	unreadCount,
	isTyping,
}) => {
	const playNewMessageSound = useNewMessageSound({
		volume: 0.7,
		playbackRate: 1.0,
	});
	const previousUnreadCountRef = React.useRef(0);

	useTypingSound(!isOpen && isTyping, {
		volume: 1,
		playbackRate: 1.3,
	});

	React.useEffect(() => {
		if (unreadCount > previousUnreadCountRef.current) {
			playNewMessageSound();
		}
		previousUnreadCountRef.current = unreadCount;
	}, [unreadCount, playNewMessageSound]);

	const activeKey = isOpen ? "chevron" : isTyping ? "typing" : "chat";
	const { displayedKey, phase } = useTransitionSwap(activeKey, 100);
	const isEntering = phase === "enter";
	const rotation =
		ICON_ROTATION[displayedKey as keyof typeof ICON_ROTATION] ??
		ICON_ROTATION.chat;

	return (
		<>
			<div
				className={cn(
					"flex items-center justify-center transition-all ease-out",
					isEntering
						? "scale-100 opacity-100 duration-200"
						: "scale-90 opacity-0 duration-100 ease-in",
					displayedKey === "typing" &&
						"pointer-events-none rounded-full text-co-primary"
				)}
				style={{
					transform: `scale(${isEntering ? 1 : 0.9}) ${isEntering ? rotation.enter : rotation.exit}`,
				}}
			>
				{displayedKey === "chevron" && (
					<Icon className="size-5" name="chevron-down" />
				)}
				{displayedKey === "typing" && (
					<BouncingDots className="bg-co-primary-foreground" />
				)}
				{displayedKey === "chat" && (
					<svg
						className="size-7"
						fill="none"
						height="60"
						viewBox="0 0 73 60"
						width="73"
						xmlns="http://www.w3.org/2000/svg"
					>
						<title>
							cossistant.com logo, open source, AI / human customer support for
							SaaS.
						</title>
						<path
							clipRule="evenodd"
							d="M72.6799 12.7088V59.6343H13.5579L0 47.0656V12.7088L13.5579 0H59.122L72.6799 12.7088Z"
							fill="currentColor"
							fillRule="evenodd"
						/>
					</svg>
				)}
			</div>

			{unreadCount > 0 && (
				<div className="co-animate-scale-in absolute top-0.5 right-0.5 flex size-2 items-center justify-center rounded-full bg-co-destructive font-medium text-[10px] text-co-destructive-foreground text-white text-xs" />
			)}
		</>
	);
};

export type DefaultTriggerProps = {
	className?: string;
};

/**
 * Default styled trigger button.
 * Used internally when no custom trigger is provided.
 */
export const DefaultTrigger: React.FC<DefaultTriggerProps> = ({
	className,
}) => (
	<Primitive.Trigger asChild>
		{({ isOpen, unreadCount, isTyping }: TriggerRenderProps) => (
			<button
				className={cn(
					"relative z-[9999] flex size-14 cursor-pointer items-center justify-center rounded-full bg-co-primary text-co-primary-foreground transition-colors hover:bg-co-primary/90 active:scale-95 active:transition-transform data-[open=true]:bg-co-primary/90",
					className
				)}
				data-open={isOpen}
				type="button"
			>
				<TriggerContent
					isOpen={isOpen}
					isTyping={isTyping}
					unreadCount={unreadCount}
				/>
			</button>
		)}
	</Primitive.Trigger>
);
