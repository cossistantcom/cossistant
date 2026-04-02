import type { RouterOutputs } from "@api/trpc/types";
import { resolveTimelineReadReceiptReaders } from "@plasma/next/primitives";
import type { AvailableAIAgent } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type { ConversationSeen } from "@plasma/types/schemas";
import { format } from "date-fns";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { TooltipOnHover } from "@/components/ui/tooltip";
import type { ConversationHeader } from "@/contexts/inboxes";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";

type ReadIndicatorProps = {
	lastReadMessageIds: Map<string, string> | undefined;
	messageId: string;
	currentUserId: string | undefined;
	firstMessage: TimelineItem | undefined;
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	availableAIAgents: AvailableAIAgent[];
	visitor: ConversationHeader["visitor"];
	messages: TimelineItem[];
	seenData?: ConversationSeen[];
};

type ReaderInfo =
	| {
			id: string;
			type: "human";
			name: string | null;
			image: string | null;
	  }
	| {
			id: string;
			type: "ai";
			name: string | null;
	  }
	| {
			id: string;
			type: "visitor";
			name: string;
			image: string | undefined;
	  };

function formatSeenTime(dateString: string | null | undefined): string {
	if (!dateString) {
		return "";
	}
	try {
		const date = new Date(dateString);
		return format(date, "MMM d 'at' h:mm a");
	} catch {
		return "";
	}
}

export function ReadIndicator({
	lastReadMessageIds,
	messageId,
	currentUserId,
	firstMessage,
	teamMembers,
	availableAIAgents,
	visitor,
	messages,
	seenData = [],
}: ReadIndicatorProps) {
	const visitorName = getVisitorNameWithFallback(visitor);
	const visitorParticipantIds = useMemo(() => {
		const ids = new Set<string>();

		if (visitor?.id) {
			ids.add(visitor.id);
		}

		for (const item of messages) {
			if (item.visitorId) {
				ids.add(item.visitorId);
			}
		}

		return ids;
	}, [messages, visitor?.id]);
	const { readers } = resolveTimelineReadReceiptReaders({
		itemId: messageId,
		lastReadItemIds: lastReadMessageIds,
		seenData,
		currentViewerId: currentUserId,
		senderIds: [
			firstMessage?.userId ?? "",
			firstMessage?.visitorId ?? "",
			firstMessage?.aiAgentId ?? "",
		],
		resolveParticipant: ({ actorType, id }) => {
			if (actorType !== "ai_agent") {
				const human = teamMembers.find((member) => member.id === id);
				if (human) {
					return {
						id,
						name: human.name ?? null,
						image: human.image,
						type: "human" as const,
					};
				}
			}

			if (actorType !== "user") {
				const ai = availableAIAgents.find((agent) => agent.id === id);
				if (ai) {
					return {
						id,
						name: ai.name,
						type: "ai" as const,
					};
				}
			}

			if (actorType === "visitor" || visitorParticipantIds.has(id)) {
				return {
					id,
					name: visitorName,
					image: visitor?.contact?.image ?? undefined,
					type: "visitor" as const,
				};
			}

			return null;
		},
	});

	if (readers.length === 0) {
		return null;
	}

	return (
		<div className={cn("my-3 flex min-h-[1.25rem] items-center justify-end")}>
			<TooltipOnHover
				content={
					<div className="flex flex-col gap-1">
						{readers.map((reader) => {
							const displayName =
								reader.participant.type === "human"
									? resolveDashboardHumanAgentDisplay({
											id: reader.participant.id,
											name: reader.participant.name,
										}).displayName
									: reader.participant.type === "ai"
										? reader.participant.name || "AI Assistant"
										: reader.participant.name;
							const seenTime = formatSeenTime(reader.lastSeenAt);
							return (
								<div
									className="flex items-center gap-2 text-xs"
									key={reader.id}
								>
									<span className="font-medium">{displayName}</span>
									{seenTime ? (
										<span className="text-primary-foreground/70">
											{seenTime}
										</span>
									) : null}
								</div>
							);
						})}
					</div>
				}
				delay={300}
			>
				<div className="flex gap-1">
					{readers.slice(0, 3).map((reader) => (
						<motion.div
							className="relative"
							key={reader.id}
							layoutId={`read-indicator-${reader.id}`}
							transition={{
								type: "tween",
								duration: 0.12,
								ease: "easeOut",
							}}
						>
							{reader.participant.type === "human" ? (
								(() => {
									const humanDisplay = resolveDashboardHumanAgentDisplay({
										id: reader.id,
										name: reader.participant.name,
									});

									return (
										<Avatar
											className="size-5 rounded border border-background"
											facehashSeed={humanDisplay.facehashSeed}
											fallbackName={humanDisplay.displayName}
											url={reader.participant.image}
										/>
									);
								})()
							) : reader.participant.type === "ai" ? (
								<Logo className="size-5 text-primary" />
							) : (
								<Avatar
									className="size-5 rounded border border-background"
									fallbackName={visitorName}
									url={reader.participant.image}
								/>
							)}
						</motion.div>
					))}
					{readers.length > 3 ? (
						<span className="flex items-center text-[10px] text-muted-foreground">
							+{readers.length - 3}
						</span>
					) : null}
				</div>
			</TooltipOnHover>
		</div>
	);
}
