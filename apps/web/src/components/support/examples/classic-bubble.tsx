import {
	Support,
	type SupportTriggerSlotProps,
} from "@cossistant/react/support";
import * as React from "react";

function mergeClassNames(...classes: Array<string | undefined>) {
	return classes.filter(Boolean).join(" ");
}

export const ClassicBubble = React.forwardRef<
	HTMLButtonElement,
	SupportTriggerSlotProps
>(function ClassicBubbleTrigger(
	{ className, isOpen, isTyping: _isTyping, unreadCount, toggle, ...props },
	ref
) {
	return (
		<button
			{...props}
			className={mergeClassNames(
				"relative flex size-14 items-center justify-center border border-black bg-black font-medium text-sm text-white shadow-xl transition-transform hover:scale-[1.02]",
				className
			)}
			onClick={toggle}
			ref={ref}
			type="button"
		>
			{isOpen ? "Close" : "Chat"}
			{unreadCount > 0 ? (
				<span className="-right-1 -top-1 absolute flex size-5 items-center justify-center border border-white bg-orange-500 text-[11px]">
					{unreadCount}
				</span>
			) : null}
		</button>
	);
});

export default function ExampleClassicBubble() {
	return <Support slots={{ trigger: ClassicBubble }} />;
}
