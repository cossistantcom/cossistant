import {
	TimelineItemGroupAvatar,
	TimelineItemGroupContent,
	TimelineItemGroupHeader,
} from "@plasma/next/primitives";
import type {
	AvailableAIAgent,
	AvailableHumanAgent,
	VisitorPresenceEntry,
} from "@plasma/types";
import { motion } from "motion/react";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import type { ConversationHeader } from "@/contexts/inboxes";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";

export type TypingParticipantType = "visitor" | "team_member" | "ai";

export type TypingParticipant = {
	id: string;
	type: TypingParticipantType;
	preview: string | null;
};

export type TypingIndicatorProps = React.HTMLAttributes<HTMLDivElement> & {
	activeTypingEntities: TypingParticipant[];
	availableAIAgents?: AvailableAIAgent[];
	visitor: ConversationHeader["visitor"];
	availableHumanAgents?: AvailableHumanAgent[];
	withAvatars?: boolean;
	visitorPresence?: VisitorPresenceEntry | null;
};

export const BouncingDots = ({ className }: { className?: string }) => (
	<div className={cn("my-auto inline-flex h-2 items-center gap-1", className)}>
		<span className="dot-bounce-1 size-[3px] rounded-full bg-primary" />
		<span className="dot-bounce-2 size-[3px] rounded-full bg-primary" />
		<span className="dot-bounce-3 size-[3px] rounded-full bg-primary" />
	</div>
);

export const VisitorTypingPreview = ({
	visitor,
	preview,
	visitorPresence,
}: {
	visitor: ConversationHeader["visitor"];
	preview: string | null;
	visitorPresence?: VisitorPresenceEntry | null;
}) => {
	const visitorName = getVisitorNameWithFallback(visitor);

	return (
		<div className={cn("flex w-full gap-2", "flex-row")}>
			<TimelineItemGroupAvatar className="flex shrink-0 flex-col justify-end">
				<Avatar
					className="size-7"
					fallbackName={visitorName}
					lastOnlineAt={visitorPresence?.lastSeenAt ?? visitor?.lastSeenAt}
					status={visitorPresence?.status}
					url={visitor?.contact?.image}
				/>
			</TimelineItemGroupAvatar>
			<TimelineItemGroupContent className={cn("flex flex-col gap-0")}>
				<TimelineItemGroupHeader className="mb-2 px-1 text-muted-foreground text-xs opacity-50">
					{visitorName} live typing
				</TimelineItemGroupHeader>

				<motion.div className="relative" key="typing-indicator-visitor">
					<div
						className={cn(
							"block max-w-full rounded-lg rounded-bl-[2px] bg-background-300 px-3 py-2 text-foreground text-sm md:w-max md:max-w-[420px] dark:bg-background-600"
						)}
					>
						{preview && preview.length < 4 ? (
							<BouncingDots />
						) : (
							<span className="text-primary/50">
								{preview as string}
								<BouncingDots className="ml-2 opacity-50" />
							</span>
						)}
					</div>
				</motion.div>
			</TimelineItemGroupContent>
		</div>
	);
};

export const AITypingPreview = ({
	aiAgent,
}: {
	aiAgent: AvailableAIAgent | undefined;
}) => {
	const agentName = aiAgent?.name ?? "AI Assistant";
	const hasImage = Boolean(aiAgent?.image);

	return (
		<div className={cn("flex w-full gap-2", "flex-row")}>
			<TimelineItemGroupAvatar className="flex shrink-0 flex-col justify-end">
				{hasImage ? (
					<Avatar
						className="size-7"
						fallbackName={agentName}
						url={aiAgent?.image}
					/>
				) : (
					<div className="flex size-7 shrink-0 items-center justify-center">
						<Logo className="size-5 text-primary/90" />
					</div>
				)}
			</TimelineItemGroupAvatar>
			<TimelineItemGroupContent className={cn("flex flex-col gap-0")}>
				<TimelineItemGroupHeader className="mb-2 px-1 text-muted-foreground text-xs opacity-50">
					{agentName} is thinking...
				</TimelineItemGroupHeader>

				<motion.div className="relative" key="typing-indicator-ai">
					<div
						className={cn(
							"block max-w-full rounded-lg rounded-bl-[2px] bg-background-300 px-3 py-2 text-foreground text-sm md:w-max md:max-w-[420px] dark:bg-background-600"
						)}
					>
						<BouncingDots />
					</div>
				</motion.div>
			</TimelineItemGroupContent>
		</div>
	);
};

export const TypingIndicator = React.forwardRef<
	HTMLDivElement,
	TypingIndicatorProps
>(
	(
		{
			activeTypingEntities,
			availableAIAgents = [],
			availableHumanAgents = [],
			withAvatars = true,
			className,
			visitor,
			visitorPresence,
			...props
		},
		ref
	) => {
		if (!activeTypingEntities || activeTypingEntities.length === 0) {
			return null;
		}

		// Find visitor typing entity
		const typingVisitorEntity = activeTypingEntities.find(
			(entity) => entity.type === "visitor" && entity.id === visitor?.id
		);

		// Find AI typing entities and match them with available AI agents
		const typingAIEntities = activeTypingEntities.filter(
			(entity) => entity.type === "ai"
		);

		return (
			<>
				{typingVisitorEntity && (
					<VisitorTypingPreview
						preview={typingVisitorEntity.preview}
						visitor={visitor}
						visitorPresence={visitorPresence}
					/>
				)}
				{typingAIEntities.map((entity) => {
					const aiAgent = availableAIAgents.find(
						(agent) => agent.id === entity.id
					);
					return <AITypingPreview aiAgent={aiAgent} key={entity.id} />;
				})}
			</>
		);
	}
);

TypingIndicator.displayName = "TypingIndicator";
