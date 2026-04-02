import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type { ConversationSeen } from "@plasma/types/schemas";
import type React from "react";
import { resolveTimelineReadReceiptReaders } from "../../primitives/timeline-read-receipts";
import { useSupportText } from "../text";
import { cn } from "../utils";
import { resolveSupportHumanAgentDisplay } from "../utils/human-agent-display";
import { Avatar } from "./avatar";

type ReadIndicatorProps = {
	lastReadMessageIds?: Map<string, string>;
	messageId: string;
	currentVisitorId?: string;
	firstMessage?: TimelineItem;
	availableHumanAgents: AvailableHumanAgent[];
	availableAIAgents: AvailableAIAgent[];
	seenData?: ConversationSeen[];
};

type ReadReceiptParticipant =
	| {
			type: "human";
			name: string;
			image: string | null;
			facehashSeed: string;
	  }
	| {
			type: "ai";
			name: string;
			image: string | null;
	  };

const MAX_VISIBLE_READERS = 3;

function formatSeenAt(lastSeenAt: string | null): string {
	if (!lastSeenAt) {
		return "";
	}

	try {
		return new Date(lastSeenAt).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return "";
	}
}

export function ReadIndicator({
	lastReadMessageIds,
	messageId,
	currentVisitorId,
	firstMessage,
	availableHumanAgents,
	availableAIAgents,
	seenData = [],
}: ReadIndicatorProps): React.ReactElement | null {
	const text = useSupportText();
	const supportTeamLabel = text("common.fallbacks.supportTeam");
	const { readers } = resolveTimelineReadReceiptReaders({
		itemId: messageId,
		lastReadItemIds: lastReadMessageIds,
		seenData,
		currentViewerId: currentVisitorId,
		senderIds: [
			firstMessage?.userId ?? "",
			firstMessage?.visitorId ?? "",
			firstMessage?.aiAgentId ?? "",
		],
		resolveParticipant: ({ actorType, id }) => {
			if (actorType === "ai_agent") {
				const aiAgent = availableAIAgents.find((agent) => agent.id === id);
				return {
					type: "ai",
					name: aiAgent?.name || "AI Assistant",
					image: aiAgent?.image ?? null,
				};
			}

			if (actorType === "visitor") {
				return null;
			}

			const humanAgent = availableHumanAgents.find((agent) => agent.id === id);
			const display = resolveSupportHumanAgentDisplay(
				humanAgent,
				supportTeamLabel
			);

			return {
				type: "human",
				name: display.displayName,
				image: humanAgent?.image ?? null,
				facehashSeed: display.facehashSeed,
			};
		},
	});

	if (readers.length === 0) {
		return null;
	}

	const accessibleLabel = `Seen by ${readers
		.map((reader) => {
			const seenAt = formatSeenAt(reader.lastSeenAt);
			return seenAt
				? `${reader.participant.name} ${seenAt}`
				: reader.participant.name;
		})
		.join(", ")}`;

	return (
		<div
			className={cn(
				"co-animate-fade-in mt-2 flex min-h-[1.25rem] items-center justify-end"
			)}
			title={accessibleLabel}
		>
			<span className="sr-only">{accessibleLabel}</span>
			<div aria-hidden="true" className="flex items-center gap-1">
				{readers.slice(0, MAX_VISIBLE_READERS).map((reader) => (
					<div className="relative" key={reader.id}>
						{reader.participant.type === "human" ? (
							<Avatar
								className="size-5"
								facehashSeed={reader.participant.facehashSeed}
								image={reader.participant.image}
								name={reader.participant.name}
							/>
						) : (
							<Avatar
								className="size-5"
								image={reader.participant.image}
								isAI
								name={reader.participant.name}
								showBackground={!!reader.participant.image}
							/>
						)}
					</div>
				))}
				{readers.length > MAX_VISIBLE_READERS ? (
					<span className="px-1 text-[10px] text-co-muted-foreground">
						+{readers.length - MAX_VISIBLE_READERS}
					</span>
				) : null}
			</div>
		</div>
	);
}
