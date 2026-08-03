"use client";

import type { TriggerRenderProps } from "@cossistant/next/support";
import { ChevronDown, MessageCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export function TriggerContent({ isOpen, unreadCount }: TriggerRenderProps) {
	return (
		<>
			<AnimatePresence mode="wait">
				{isOpen ? (
					<motion.div
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.8, opacity: 0 }}
						initial={{ scale: 0.8, opacity: 0 }}
						key="close"
					>
						<ChevronDown className="size-5" />
					</motion.div>
				) : (
					<motion.div
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.8, opacity: 0 }}
						initial={{ scale: 0.8, opacity: 0 }}
						key="open"
					>
						<MessageCircle className="size-6" />
					</motion.div>
				)}
			</AnimatePresence>
			{unreadCount > 0 && (
				<span className="-top-1 -right-1 absolute flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs">
					{unreadCount}
				</span>
			)}
		</>
	);
}
