"use client";

import { LazySupport } from "@cossistant/next/lazy-support";
import type {
	SupportSlotProps,
	SupportSlots,
	SupportTriggerSlotProps,
} from "@cossistant/next/support";
import { forwardRef, Suspense } from "react";
import { LandingTriggerContent } from "./custom-trigger";

const LandingTrigger = forwardRef<HTMLButtonElement, SupportTriggerSlotProps>(
	function LandingTriggerSlot(
		{ className, isOpen, isTyping, unreadCount, toggle, ...props },
		ref
	) {
		return (
			<button
				{...props}
				className={className}
				onClick={toggle}
				ref={ref}
				type="button"
			>
				<LandingTriggerContent
					isOpen={isOpen}
					isTyping={isTyping}
					toggle={toggle}
					unreadCount={unreadCount}
				/>
			</button>
		);
	}
);

const LANDING_SUPPORT_SLOTS = {
	trigger: LandingTrigger,
} satisfies SupportSlots;

const LANDING_SUPPORT_SLOT_PROPS = {
	trigger: {
		className:
			"fixed right-4 bottom-4 z-[9999] flex size-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors",
	},
} satisfies SupportSlotProps;

/**
 * Next-aware lazy Support widget for the shared marketing and docs layout.
 */
export function LandingSupportTrigger() {
	return (
		<Suspense fallback={null}>
			<LazySupport
				slotProps={LANDING_SUPPORT_SLOT_PROPS}
				slots={LANDING_SUPPORT_SLOTS}
			/>
		</Suspense>
	);
}
