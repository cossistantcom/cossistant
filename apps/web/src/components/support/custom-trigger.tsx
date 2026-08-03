"use client";

import type { TriggerRenderProps } from "@cossistant/react/support";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { BouncingDots } from "../conversation/messages/typing-indicator";
import Icon from "../ui/icons";
import { LogoEyesTracking } from "../ui/logo-eyes-tracking";

type TriggerContentProps = {
	isOpen: boolean;
	isTyping: boolean;
	unreadCount: number;
};

/**
 * Shared animated content for triggers.
 */
const TriggerIconContent = ({
	isOpen,
	isTyping,
	icon,
	iconSize = "size-5",
}: TriggerContentProps & {
	icon: React.ReactNode;
	iconSize?: string;
}) => (
	<AnimatePresence mode="wait">
		{isOpen ? (
			<motion.div
				animate={{
					scale: 1,
					rotate: 0,
					opacity: 1,
					transition: { duration: 0.2, ease: "easeOut" },
				}}
				className="flex items-center justify-center"
				exit={{
					scale: 0.9,
					rotate: -45,
					opacity: 0,
					transition: { duration: 0.1, ease: "easeIn" },
				}}
				initial={{ scale: 0.9, rotate: 45, opacity: 0 }}
				key="chevron"
			>
				<Icon className={iconSize} name="chevron-down" />
			</motion.div>
		) : isTyping ? (
			<motion.span
				animate={{
					opacity: 1,
					scale: 1,
					transition: { duration: 0.2, ease: "easeOut" },
				}}
				className="pointer-events-none flex items-center rounded-full text-co-primary"
				exit={{
					opacity: 0,
					scale: 0.9,
					transition: { duration: 0.1, ease: "easeIn" },
				}}
				initial={{ opacity: 0, scale: 0.9 }}
				key="typing-indicator"
			>
				<BouncingDots className="bg-co-primary-foreground" />
			</motion.span>
		) : (
			<motion.div
				animate={{
					scale: 1,
					rotate: 0,
					opacity: 1,
					transition: { duration: 0.2, ease: "easeOut" },
				}}
				className="flex items-center justify-center"
				exit={{
					scale: 0.9,
					rotate: 45,
					opacity: 0,
					transition: { duration: 0.1, ease: "easeIn" },
				}}
				initial={{ scale: 0.9, rotate: -45, opacity: 0 }}
				key="icon"
			>
				{icon}
			</motion.div>
		)}
	</AnimatePresence>
);

/**
 * Unread badge indicator.
 */
const UnreadBadge = ({
	count,
	className,
}: {
	count: number;
	className?: string;
}) =>
	count > 0 ? (
		<motion.div
			animate={{ scale: 1, opacity: 1 }}
			className={cn(
				"absolute flex size-1.5 items-center justify-center rounded-full bg-cossistant-orange",
				className
			)}
			exit={{ scale: 0, opacity: 0 }}
			initial={{ scale: 0, opacity: 0 }}
		/>
	) : null;

// =============================================================================
// Landing Page Trigger Content
// =============================================================================

/**
 * Content for the landing page trigger (primary circular button with logo).
 */
export const LandingTriggerContent = ({
	isOpen,
	isTyping,
	unreadCount,
}: TriggerRenderProps) => (
	<>
		<TriggerIconContent
			icon={<LogoEyesTracking className="size-7.5" />}
			iconSize="h-5 w-5"
			isOpen={isOpen}
			isTyping={isTyping}
			unreadCount={unreadCount}
		/>
		<UnreadBadge className="top-0.5 right-0.5" count={unreadCount} />
	</>
);
