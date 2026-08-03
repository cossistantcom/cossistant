import {
	Support,
	type SupportTriggerSlotProps,
} from "@cossistant/react/support";
import * as React from "react";

function mergeClassNames(...classes: Array<string | undefined>) {
	return classes.filter(Boolean).join(" ");
}

export const PillBubble = React.forwardRef<
	HTMLButtonElement,
	SupportTriggerSlotProps
>(function PillBubbleTrigger(
	{
		className,
		isOpen: _isOpen,
		isTyping,
		unreadCount: _unreadCount,
		toggle,
		...props
	},
	ref
) {
	return (
		<button
			{...props}
			className={mergeClassNames(
				"flex h-12 items-center gap-2 border border-black bg-white px-4 font-medium text-black text-sm shadow-xl transition-transform hover:scale-[1.01]",
				className
			)}
			onClick={toggle}
			ref={ref}
			type="button"
		>
			<span className="size-2 bg-orange-500" />
			<span>{isTyping ? "Support is typing..." : "Open support"}</span>
		</button>
	);
});

export default function ExamplePillBubble() {
	return <Support slots={{ trigger: PillBubble }} />;
}
