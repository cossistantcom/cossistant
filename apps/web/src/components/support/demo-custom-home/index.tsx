"use client";

import {
	Support,
	type SupportHomePageSlotProps,
} from "@cossistant/react/support";
import { cn } from "@/lib/utils";
import { SupportDocsProvider } from "../docs-demo/provider";
import { SupportDemoStage } from "../docs-demo/stage";

function CustomHomePage({
	className,
	openConversationHistory,
	quickOptions,
	startConversation,
	website,
}: SupportHomePageSlotProps) {
	return (
		<div
			className={cn(
				"flex h-full flex-col bg-neutral-950 text-white",
				className
			)}
		>
			<div className="border-white/10 border-b px-6 py-5">
				<p className="font-mono text-[11px] text-white/45 uppercase tracking-[0.22em]">
					{website?.name}
				</p>
				<h2 className="mt-3 font-medium text-3xl">Real support, instantly.</h2>
				<p className="mt-2 max-w-xs text-sm text-white/65 leading-6">
					Ask about onboarding, setup, billing, or migration without leaving the
					product.
				</p>
			</div>

			<div className="flex flex-1 flex-col gap-3 px-6 py-5">
				{quickOptions.map((option) => (
					<button
						className="border border-white/10 bg-white/5 px-4 py-3 text-left text-sm transition-colors hover:bg-white/10"
						key={option}
						onClick={() => startConversation(option)}
						type="button"
					>
						{option}
					</button>
				))}

				<button
					className="mt-auto w-fit text-sm text-white/60 underline underline-offset-4"
					onClick={openConversationHistory}
					type="button"
				>
					View past conversations
				</button>
			</div>
		</div>
	);
}

export default function SupportCustomHomeDemo() {
	return (
		<SupportDocsProvider>
			<SupportDemoStage variant="panel">
				<Support
					mode="responsive"
					quickOptions={[
						"Can I ship this with Tailwind?",
						"How do I swap the trigger?",
						"Can I keep the default conversation page?",
					]}
					slotProps={{
						content: {
							className: "border border-neutral-200 shadow-2xl",
						},
					}}
					slots={{ homePage: CustomHomePage }}
				/>
			</SupportDemoStage>
		</SupportDocsProvider>
	);
}
