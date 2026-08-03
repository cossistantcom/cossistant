"use client";

import { Support, useSupportNavigation } from "@cossistant/react/support";
import { SupportDocsProvider } from "../docs-demo/provider";
import { SupportDemoStage } from "../docs-demo/stage";

function LaunchChecklistPage() {
	const { navigate } = useSupportNavigation();

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="border-border border-b px-5 py-4">
				<h2 className="font-medium text-2xl text-primary">Launch checklist</h2>
				<p className="mt-2 max-w-xs text-muted-foreground text-sm leading-6">
					Pick the quickest path to ship a support widget that matches your
					product.
				</p>
			</div>

			<div className="grid gap-3 px-5 py-5">
				{[
					"Install the package",
					"Wrap your app with SupportProvider",
					"Choose slots or full composition",
				].map((item) => (
					<div
						className="border border-border/80 bg-background-50 px-4 py-3 text-sm"
						key={item}
					>
						{item}
					</div>
				))}
			</div>

			<div className="mt-auto px-5 pb-5">
				<button
					className="w-full bg-primary px-4 py-3 text-primary-foreground text-sm"
					onClick={() =>
						navigate({
							page: "CONVERSATION",
							params: {
								conversationId: "pending_docs_conversation",
								initialMessage: "Help me implement the slots API",
							},
						})
					}
					type="button"
				>
					Start a conversation
				</button>
			</div>
		</div>
	);
}

export default function SupportFullCompositionDemo() {
	return (
		<SupportDocsProvider>
			<SupportDemoStage variant="panel">
				<Support.Root mode="responsive">
					<Support.Content className="border border-border shadow-2xl">
						<Support.Router>
							<Support.Page component={LaunchChecklistPage} name="HOME" />
						</Support.Router>
					</Support.Content>
				</Support.Root>
			</SupportDemoStage>
		</SupportDocsProvider>
	);
}
