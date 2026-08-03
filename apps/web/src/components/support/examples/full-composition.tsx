import { Support, useSupportNavigation } from "@cossistant/react/support";

function LaunchChecklistPage() {
	const { navigate } = useSupportNavigation();

	return (
		<div>
			<h2>Fully composed support shell</h2>

			<button
				onClick={() =>
					navigate({
						page: "CONVERSATION",
						params: {
							conversationId: "pending_conversation",
							initialMessage: "Help me implement the slots API",
						},
					})
				}
				type="button"
			>
				Start a conversation
			</button>
		</div>
	);
}

export default function ExampleFullComposition() {
	return (
		<Support.Root>
			<Support.Trigger asChild>
				<button type="button">Compose support</button>
			</Support.Trigger>

			<Support.Content>
				<Support.Router>
					<Support.Page component={LaunchChecklistPage} name="HOME" />
				</Support.Router>
			</Support.Content>
		</Support.Root>
	);
}
