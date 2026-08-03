import type { RouterOutputs } from "@api/trpc/types";
import {
	ConversationTimelineContainer,
	DaySeparator,
	DaySeparatorLabel,
	DaySeparatorLine,
	ConversationTimeline as PrimitiveConversationTimeline,
} from "@cossistant/next/primitives";
import { useConversationTyping } from "@cossistant/react/hooks";
import { useGroupedMessages } from "@cossistant/react/internal/hooks";

import type { AvailableAIAgent } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { ConversationSeen } from "@cossistant/types/schemas";
import { AnimatePresence } from "motion/react";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { ConversationHeader } from "@/contexts/inboxes";
import { useVisitorPresenceById } from "@/contexts/visitor-presence";
import { useWebsite } from "@/contexts/website";
import { useConversationDeveloperMode } from "@/hooks/use-conversation-developer-mode";
import { useDashboardTypingSound } from "@/hooks/use-dashboard-typing-sound";
import { useSoundPreferences } from "@/hooks/use-sound-preferences";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { extractEventPart } from "@/lib/timeline-events";
import { isCustomerFacingToolTimelineItem } from "@/lib/tool-timeline-visibility";
import { cn } from "@/lib/utils";
import {
	buildDashboardTimelineRenderItems,
	buildPublicActivityGroupFromTool,
} from "./dashboard-timeline-render-items";
import { DeveloperLogGroup } from "./developer-log-group";
import { ConversationEvent } from "./event";
import { TimelineActivityGroup } from "./timeline-activity-group";
import { TimelineMessageGroup } from "./timeline-message-group";
import { TypingIndicator, type TypingParticipant } from "./typing-indicator";

const EMPTY_TIMELINE_ITEMS: TimelineItem[] = [];
const EMPTY_TEAM_MEMBERS: RouterOutputs["user"]["getWebsiteMembers"] = [];
const EMPTY_AVAILABLE_AI_AGENTS: AvailableAIAgent[] = [];
const EMPTY_SEEN_DATA: ConversationSeen[] = [];

type ConversationTimelineListProps = {
	ref?: React.RefObject<HTMLDivElement | null>;
	items: TimelineItem[];
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	availableAIAgents: AvailableAIAgent[];
	seenData?: ConversationSeen[];
	visitor: ConversationHeader["visitor"];
	conversationVisitorLanguage?: string | null;
	currentUserId: string;
	conversationId: string;
	className?: string;
	onFetchMoreIfNeeded?: () => void;
	/** Height of the input/escalation panel for dynamic bottom padding */
	inputHeight?: number;
};

export function ConversationTimelineList({
	ref,
	items: timelineItems = EMPTY_TIMELINE_ITEMS,
	teamMembers = EMPTY_TEAM_MEMBERS,
	availableAIAgents = EMPTY_AVAILABLE_AI_AGENTS,
	seenData = EMPTY_SEEN_DATA,
	currentUserId,
	conversationId,
	className,
	onFetchMoreIfNeeded,
	visitor,
	conversationVisitorLanguage,
	inputHeight = 140,
}: ConversationTimelineListProps) {
	const fallbackRef = useRef<HTMLDivElement | null>(null);
	const messageListRef =
		(ref as RefObject<HTMLDivElement | null> | undefined) ?? fallbackRef;

	const website = useWebsite();
	const { typingEnabled } = useSoundPreferences({
		websiteSlug: website.slug,
	});

	const isDeveloperModeEnabled = useConversationDeveloperMode(
		(state) => state.isDeveloperModeEnabled
	);

	const groupedTimelineItems = useMemo(() => {
		if (isDeveloperModeEnabled) {
			return timelineItems;
		}

		return timelineItems.filter(
			(item) => item.type !== "tool" || isCustomerFacingToolTimelineItem(item)
		);
	}, [isDeveloperModeEnabled, timelineItems]);

	const { items: groupedItems, lastReadMessageMap } = useGroupedMessages({
		items: groupedTimelineItems,
		seenData,
		currentViewerId: currentUserId,
	});

	const renderItems = useMemo(
		() =>
			buildDashboardTimelineRenderItems(groupedItems, isDeveloperModeEnabled),
		[groupedItems, isDeveloperModeEnabled]
	);

	const typingEntries = useConversationTyping(conversationId, {
		excludeUserId: currentUserId,
	});

	const visitorPresence = useVisitorPresenceById(visitor?.id);

	const availableHumanAgents = useMemo(
		() =>
			teamMembers.map((member) => {
				const memberDisplay = resolveDashboardHumanAgentDisplay(member);

				return {
					id: member.id,
					name: memberDisplay.displayName,
					email: member.email ?? null,
					image: member.image,
					lastSeenAt: member.lastSeenAt,
				};
			}),
		[teamMembers]
	);

	const activeTypingEntities = useMemo(
		() =>
			typingEntries
				.map((entry): TypingParticipant | null => {
					if (entry.actorType === "visitor") {
						return {
							id: entry.actorId,
							type: "visitor" as const,
							preview: entry.preview,
						};
					}

					if (entry.actorType === "ai_agent") {
						return {
							id: entry.actorId,
							type: "ai" as const,
							preview: entry.preview,
						};
					}

					return null;
				})
				.filter(
					(participant): participant is TypingParticipant =>
						participant !== null
				),
		[typingEntries]
	);

	// Play typing sound when someone is typing
	useDashboardTypingSound(activeTypingEntities.length > 0, typingEnabled);

	useEffect(() => {
		if (!messageListRef.current || activeTypingEntities.length === 0) {
			return;
		}

		messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
	}, [activeTypingEntities, messageListRef]);

	return (
		<PrimitiveConversationTimeline
			autoScroll={true}
			className={cn(
				"overflow-y-scroll pt-20",
				"scrollbar-thin scrollbar-thumb-background-300 scrollbar-track-transparent",
				"h-full w-full",
				className
			)}
			id="conversation-timeline"
			items={timelineItems}
			maskHeight="100px"
			onScrollStart={onFetchMoreIfNeeded}
			ref={ref ?? messageListRef}
			style={{
				paddingBottom: `${inputHeight + 100}px`,
			}}
		>
			<div className="mx-auto pr-4 pl-4 xl:max-w-xl 2xl:max-w-2xl">
				<ConversationTimelineContainer className="flex min-h-full w-full flex-col gap-5">
					<AnimatePresence initial={false} mode="popLayout">
						{renderItems.map((item, index) => {
							if (item.type === "day_separator") {
								// Render day separator using the primitive
								return (
									<DaySeparator
										className="flex items-center gap-4 py-4"
										date={item.date}
										dateString={item.dateString}
										key={`day-separator-${item.dateString}`}
									>
										{({ formattedDate }) => (
											<>
												<DaySeparatorLine className="h-px flex-1 bg-border/50" />
												<DaySeparatorLabel
													className="text-muted-foreground/70 text-xs"
													formattedDate={formattedDate}
												/>
												<DaySeparatorLine className="h-px flex-1 bg-border/50" />
											</>
										)}
									</DaySeparator>
								);
							}

							if (item.type === "public_activity_group") {
								const activityGroupKey =
									item.firstItemId ||
									item.items[0]?.id ||
									`activity-group-${index}`;

								return (
									<TimelineActivityGroup
										availableAIAgents={availableAIAgents}
										currentUserId={currentUserId}
										group={item}
										key={activityGroupKey}
										teamMembers={teamMembers}
										visitor={visitor}
									/>
								);
							}

							if (item.type === "developer_log_group") {
								const developerGroupKey =
									item.firstItemId ||
									item.items[0]?.id ||
									`developer-log-group-${index}`;

								return (
									<DeveloperLogGroup
										availableAIAgents={availableAIAgents}
										currentUserId={currentUserId}
										group={item}
										key={developerGroupKey}
										teamMembers={teamMembers}
										visitor={visitor}
									/>
								);
							}

							if (item.type === "timeline_event") {
								// Extract event data from parts
								const eventPart = extractEventPart(item.item);

								// Only render if we have valid event data
								if (!eventPart) {
									return null;
								}

								return (
									<ConversationEvent
										availableAIAgents={availableAIAgents}
										availableHumanAgents={availableHumanAgents}
										createdAt={item.item.createdAt}
										event={eventPart}
										key={item.item.id || `timeline-event-${index}`}
										visitor={visitor}
									/>
								);
							}

							if (item.type === "public_timeline_tool") {
								const key = item.item.id ?? `timeline-tool-${index}`;
								return (
									<TimelineActivityGroup
										availableAIAgents={availableAIAgents}
										currentUserId={currentUserId}
										group={buildPublicActivityGroupFromTool(item.item)}
										key={key}
										teamMembers={teamMembers}
										visitor={visitor}
									/>
								);
							}

							// Use first timeline item ID as stable key
							const groupKey = item.items?.[0]?.id || `group-${index}`;

							return (
								<TimelineMessageGroup
									availableAIAgents={availableAIAgents}
									conversationVisitorLanguage={
										conversationVisitorLanguage ?? null
									}
									currentUserId={currentUserId}
									items={item.items || []}
									key={groupKey}
									lastReadMessageIds={lastReadMessageMap}
									seenData={seenData}
									teamMembers={teamMembers}
									visitor={visitor}
									visitorPresence={visitorPresence}
								/>
							);
						})}
					</AnimatePresence>
					{activeTypingEntities.length > 0 && (
						<TypingIndicator
							activeTypingEntities={activeTypingEntities}
							availableAIAgents={availableAIAgents}
							availableHumanAgents={availableHumanAgents}
							className="mt-2"
							visitor={visitor}
							visitorPresence={visitorPresence}
						/>
					)}
				</ConversationTimelineContainer>
			</div>
		</PrimitiveConversationTimeline>
	);
}

ConversationTimelineList.displayName = "ConversationTimelineList";
