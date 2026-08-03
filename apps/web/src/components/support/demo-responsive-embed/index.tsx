"use client";

import { Support } from "@cossistant/react/support";
import { SupportDocsProvider } from "../docs-demo/provider";
import { SupportDemoStage } from "../docs-demo/stage";

export default function SupportResponsiveEmbedDemo() {
	return (
		<SupportDocsProvider>
			<SupportDemoStage variant="responsive">
				<div className="h-full w-full overflow-hidden border border-border bg-background shadow-sm">
					<Support
						mode="responsive"
						quickOptions={[
							"How do I embed support inline?",
							"Can I keep my own shell?",
							"What can I override with slots?",
						]}
						slotProps={{
							content: {
								className: "bg-background",
							},
						}}
					/>
				</div>
			</SupportDemoStage>
		</SupportDocsProvider>
	);
}
