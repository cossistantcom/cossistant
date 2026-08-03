import {
	Support,
	type SupportHomePageSlotProps,
	type SupportTriggerSlotProps,
} from "@cossistant/react/support";
import * as React from "react";

const EditorialBubble = React.forwardRef<
	HTMLButtonElement,
	SupportTriggerSlotProps
>(function EditorialBubbleTrigger({ className, toggle, ...props }, ref) {
	return (
		<button
			{...props}
			className={className}
			onClick={toggle}
			ref={ref}
			type="button"
		>
			Need help?
		</button>
	);
});

function LaunchHomePage({
	className,
	quickOptions,
	startConversation,
	visitor,
}: SupportHomePageSlotProps) {
	return (
		<div className={className}>
			<h2>Hi {visitor?.contact?.name ?? "there"}, what are you building?</h2>

			{quickOptions.map((option) => (
				<button
					key={option}
					onClick={() => startConversation(option)}
					type="button"
				>
					{option}
				</button>
			))}
		</div>
	);
}

export default function ExampleBubbleAndHome() {
	return (
		<Support
			slotProps={{
				content: {
					className: "border shadow-2xl",
				},
			}}
			slots={{
				homePage: LaunchHomePage,
				trigger: EditorialBubble,
			}}
		/>
	);
}
