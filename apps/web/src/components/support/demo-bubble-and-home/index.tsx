"use client";

import {
	Support,
	type SupportHomePageSlotProps,
	type SupportTriggerSlotProps,
} from "@cossistant/react/support";
import * as React from "react";
import { cn } from "@/lib/utils";
import { LandingTriggerContent } from "../custom-trigger";
import { SupportDocsProvider } from "../docs-demo/provider";
import { SupportDemoStage } from "../docs-demo/stage";

const EditorialBubble = React.forwardRef<
	HTMLButtonElement,
	SupportTriggerSlotProps
>(function EditorialBubbleTrigger(
	{ className, isOpen, isTyping, unreadCount, toggle, ...props },
	ref
) {
	return (
		<button
			{...props}
			className={cn(
				"flex items-center gap-3 bg-black px-4 py-3 text-white shadow-2xl",
				className
			)}
			onClick={toggle}
			ref={ref}
			type="button"
		>
			<div className="relative flex size-8 items-center justify-center bg-white/10">
				<LandingTriggerContent
					isOpen={isOpen}
					isTyping={isTyping}
					toggle={toggle}
					unreadCount={unreadCount}
				/>
			</div>
			<div className="flex flex-col items-start">
				<span className="font-medium text-sm">Need help?</span>
				<span className="text-[11px] text-white/60">
					Composable support widget
				</span>
			</div>
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
		<div
			className={cn(
				"flex h-full flex-col bg-[radial-gradient(circle_at_top,_rgba(254,240,138,0.32),_transparent_42%),linear-gradient(180deg,#fffef8_0%,#ffffff_55%)]",
				className
			)}
		>
			<div className="px-6 pt-6">
				<p className="font-mono text-[11px] text-primary/45 uppercase tracking-[0.2em]">
					launch support
				</p>
				<h2 className="mt-3 max-w-xs font-medium text-3xl text-primary">
					Hi {visitor?.contact?.name ?? "there"}, what are you building?
				</h2>
			</div>

			<div className="grid gap-3 px-6 py-5">
				{quickOptions.map((option) => (
					<button
						className="hover:-translate-y-0.5 border border-black/6 bg-white px-4 py-3 text-left text-sm shadow-sm transition-transform"
						key={option}
						onClick={() => startConversation(option)}
						type="button"
					>
						{option}
					</button>
				))}
			</div>
		</div>
	);
}

export default function SupportBubbleAndHomeDemo() {
	return (
		<SupportDocsProvider>
			<SupportDemoStage variant="floating">
				<Support
					align="center"
					avoidCollisions={false}
					className="h-full w-full"
					open={true}
					quickOptions={[
						"Help me launch faster",
						"Show me the React API",
						"Can I swap only the home page?",
					]}
					slotProps={{
						content: {
							className: "border border-black/8 shadow-2xl",
						},
						trigger: {
							className: "absolute bottom-0 left-1/2 -translate-x-1/2",
						},
					}}
					slots={{
						homePage: LaunchHomePage,
						trigger: EditorialBubble,
					}}
				/>
			</SupportDemoStage>
		</SupportDocsProvider>
	);
}
