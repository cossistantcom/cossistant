import {
	Support,
	type SupportHomePageSlotProps,
} from "@cossistant/react/support";

function CustomHomePage({
	className,
	openConversationHistory,
	quickOptions,
	startConversation,
	website,
}: SupportHomePageSlotProps) {
	return (
		<div className={className}>
			<h2>{website?.name}</h2>
			<p>
				Rewrite the first screen while keeping the default conversation flow.
			</p>

			{quickOptions.map((option) => (
				<button
					key={option}
					onClick={() => startConversation(option)}
					type="button"
				>
					{option}
				</button>
			))}

			<button onClick={openConversationHistory} type="button">
				View past conversations
			</button>
		</div>
	);
}

export default function ExampleCustomHome() {
	return (
		<Support
			slotProps={{
				content: {
					className: "border shadow-2xl",
				},
			}}
			slots={{ homePage: CustomHomePage }}
		/>
	);
}
