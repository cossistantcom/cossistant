"use client";

import type { SupportTriggerSlotProps } from "@cossistant/react/support";
import * as React from "react";

type TriggerComponent = React.ForwardRefExoticComponent<
	SupportTriggerSlotProps & React.RefAttributes<HTMLButtonElement>
>;

type SupportTriggerStatePreviewProps = {
	Trigger: TriggerComponent;
	className?: string;
	isTypingWhenOpen?: boolean;
	unreadCount?: number;
};

export function SupportTriggerStatePreview({
	Trigger,
	className,
	isTypingWhenOpen = false,
	unreadCount = 2,
}: SupportTriggerStatePreviewProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const toggle = React.useCallback(() => setIsOpen((open) => !open), []);

	return (
		<Trigger
			aria-expanded={isOpen}
			aria-haspopup="dialog"
			className={className}
			data-slot="trigger"
			data-state={isOpen ? "open" : "closed"}
			isOpen={isOpen}
			isTyping={isTypingWhenOpen && isOpen}
			onClick={toggle}
			toggle={toggle}
			type="button"
			unreadCount={isOpen ? 0 : unreadCount}
		/>
	);
}
