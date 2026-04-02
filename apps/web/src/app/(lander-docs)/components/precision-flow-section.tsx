import { cn } from "@/lib/utils";
import { FullWidthBorder } from "./full-width-border";
import {
	PRECISION_FLOW_INITIAL_PHASE,
	type PrecisionFlowPhase,
} from "./precision-flow-demo";
import {
	PrecisionFlowPlaybackControls,
	PrecisionFlowPlaybackProvider,
	PrecisionFlowPlaybackStage,
} from "./precision-flow-playback";

export {
	getPrecisionFlowPrimaryActionPresentation,
	getPrecisionFlowReplayButtonLabel,
} from "./precision-flow-presentation";

type PrecisionFlowSectionProps = {
	initialPhase?: PrecisionFlowPhase;
	autoplay?: boolean;
	className?: string;
};

export function PrecisionFlowSection({
	initialPhase = PRECISION_FLOW_INITIAL_PHASE,
	autoplay = true,
	className,
}: PrecisionFlowSectionProps) {
	return (
		<section
			className={cn("relative flex min-h-screen flex-col", className)}
			suppressHydrationWarning
		>
			<FullWidthBorder className="top-0" />
			<PrecisionFlowPlaybackProvider
				autoplay={autoplay}
				className="relative flex h-full flex-1 flex-col lg:min-h-screen lg:flex-row"
				initialPhase={initialPhase}
			>
				<div className="flex min-w-0 flex-1 flex-col justify-center gap-8 border-dashed px-4 py-16 lg:w-1/2 lg:flex-[0_0_50%] lg:border-r lg:px-8 xl:px-12">
					<div className="space-y-4">
						<p className="font-medium font-mono text-plasma-orange text-sm">
							[How it learns]
						</p>
						<h2 className="max-w-xl text-balance font-f37-stout text-3xl leading-tight md:text-4xl">
							When the AI agent doesn't know,
							<br />
							it asks you for clarification.
						</h2>
						<p className="max-w-xl text-balance text-primary/80 text-sm md:text-base">
							You answer once, and the AI agent uses that answer next time.
						</p>
					</div>

					<PrecisionFlowPlaybackControls />
				</div>

				<div className="relative flex min-h-[560px] min-w-0 flex-1 items-stretch lg:w-1/2 lg:flex-[0_0_50%] dark:bg-background-50">
					<PrecisionFlowPlaybackStage />
				</div>
			</PrecisionFlowPlaybackProvider>
		</section>
	);
}
