"use client";

import Icon from "@plasma/react/support/components/icons";
import { BouncingDots } from "@plasma/react/support/components/typing-indicator";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";

export type BubbleProps = {
	className?: string;
	unreadCount?: number;
	isOpen?: boolean;
	isTyping?: boolean;
};

export const FakeBubble: React.FC<BubbleProps> = ({
	className,
	unreadCount,
	isOpen,
	isTyping,
}) => (
	<div
		className={cn(
			"relative flex size-12 cursor-pointer items-center justify-center rounded-full bg-co-primary text-co-primary-foreground transition-colors hover:bg-co-primary/90 data-[open=true]:bg-co-primary/90",
			className
		)}
	>
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
					<Icon className="h-5 w-5" name="chevron-down" />
				</motion.div>
			) : isTyping ? (
				<motion.span
					animate={{
						opacity: 1,
						scale: 1,
						transition: {
							duration: 0.2,
							ease: "easeOut",
						},
					}}
					className="pointer-events-none flex items-center rounded-full text-primary"
					exit={{
						opacity: 0,
						scale: 0.9,
						transition: {
							duration: 0.1,
							ease: "easeIn",
						},
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
					key="chat"
				>
					<Icon className="h-6 w-6" name="chat" variant="filled" />
				</motion.div>
			)}
		</AnimatePresence>

		{unreadCount && unreadCount > 0 && (
			<motion.div
				animate={{ scale: 1, opacity: 1 }}
				className="-top-0 -right-0 absolute flex h-3 w-3 items-center justify-center rounded-full bg-co-destructive font-medium text-[10px] text-co-destructive-foreground text-white text-xs"
				exit={{ scale: 0, opacity: 0 }}
				initial={{ scale: 0, opacity: 0 }}
			/>
		)}
	</div>
);
