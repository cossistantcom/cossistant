/** biome-ignore-all lint/nursery/useImageSize:ok */
/** biome-ignore-all lint/style/useConsistentArrayType: we dont care */
"use client";

import { ConversationEvent } from "@plasma/react/support/components/conversation-event";
import { TimelineMessageGroup } from "@plasma/react/support/components/timeline-message-group";
import { SupportTextProvider } from "@plasma/react/support/text";
import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import { type ConversationEventType, SenderType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/ui/logo";

const anthonyAvatar =
	"https://pbs.twimg.com/profile_images/1952043514692280321/v4gOT-jg_400x400.jpg";

type ChatSequenceItem = {
	delay: number;
	duration?: number;
} & (
	| {
			type: "timeline_item";
			item: TimelineItem;
	  }
	| {
			type: "typing";
			senderType: SenderType;
			aiAgentId: string | null;
			userId: string | null;
			visitorId: string | null;
	  }
	| {
			type: "event";
			event: {
				id: string;
				conversationId: string;
				organizationId: string;
				eventType: string;
				actorUserId: string | null;
				actorAiAgentId: string | null;
				targetUserId: string | null;
				targetAiAgentId: string | null;
				metadata: Record<string, unknown>;
				createdAt: string;
				updatedAt: string;
				deletedAt: string | null;
			};
	  }
);

const chatSequence: ChatSequenceItem[] = [
	{
		type: "timeline_item",
		item: {
			id: "1",
			conversationId: "1",
			organizationId: "1",
			type: "message",
			text: "Hi! I see a blank page after onboarding, can you help?",
			parts: [
				{
					type: "text",
					text: "Hi! I see a blank page after onboarding, can you help?",
				},
			],
			visibility: "public",
			visitorId: "visitor",
			userId: null,
			aiAgentId: null,
			createdAt: new Date().toISOString(),
			deletedAt: null,
		},
		delay: 0.5,
	},
	{
		type: "typing",
		senderType: SenderType.AI,
		userId: null,
		visitorId: null,
		aiAgentId: "cossistant",
		delay: 4.0,
		duration: 2.5,
	},
	{
		type: "timeline_item",
		item: {
			id: "2",
			conversationId: "1",
			organizationId: "1",
			type: "message",
			text: "Hi! I see an error in the logs. This looks urgent sorry for that, let me connect you with Anthony.",
			parts: [
				{
					type: "text",
					text: "Hi! I see an error in the logs. This looks urgent sorry for that, let me connect you with Anthony.",
				},
			],
			visibility: "public",
			aiAgentId: "cossistant",
			userId: null,
			visitorId: null,
			createdAt: new Date().toISOString(),
			deletedAt: null,
		},
		delay: 6.5,
	},
	{
		type: "typing",
		senderType: SenderType.AI,
		aiAgentId: "cossistant",
		userId: null,
		visitorId: null,
		delay: 8.5,
		duration: 1.5,
	},
	{
		type: "timeline_item",
		item: {
			id: "3",
			conversationId: "1",
			organizationId: "1",
			type: "message",
			text: "Created a ticket to track this. Thanks!",
			parts: [
				{ type: "text", text: "Created a ticket to track this. Thanks!" },
			],
			visibility: "public",
			aiAgentId: "cossistant",
			userId: null,
			visitorId: null,
			createdAt: new Date().toISOString(),
			deletedAt: null,
		},
		delay: 10.0,
	},
	{
		type: "event",
		event: {
			id: "1",
			conversationId: "1",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null,
			eventType: "participant_joined",
			actorUserId: "anthony",
			actorAiAgentId: null,
			targetUserId: null,
			targetAiAgentId: null,
			organizationId: "1",
			metadata: {},
		},
		delay: 12.0,
	},
	{
		type: "typing",
		senderType: SenderType.TEAM_MEMBER,
		aiAgentId: null,
		userId: "anthony",
		visitorId: null,
		delay: 13.0,
		duration: 3.0,
	},
	{
		type: "timeline_item",
		item: {
			id: "4",
			conversationId: "1",
			organizationId: "1",
			type: "message",
			text: "Hi! I'm working on a fix, should be up in a few minutes! 🙏",
			parts: [
				{
					type: "text",
					text: "Hi! I'm working on a fix, should be up in a few minutes! 🙏",
				},
			],
			visibility: "public",
			userId: "anthony",
			aiAgentId: null,
			visitorId: null,
			createdAt: new Date().toISOString(),
			deletedAt: null,
		},
		delay: 16.0,
	},
	{
		type: "typing",
		senderType: SenderType.TEAM_MEMBER,
		aiAgentId: null,
		userId: "anthony",
		visitorId: null,
		delay: 19.0,
		duration: 3.0,
	},
	{
		type: "timeline_item",
		item: {
			id: "5",
			conversationId: "1",
			organizationId: "1",
			type: "message",
			text: "Anything else I can help with?",
			parts: [{ type: "text", text: "Anything else I can help with?" }],
			visibility: "public",
			userId: "anthony",
			aiAgentId: null,
			visitorId: null,
			createdAt: new Date().toISOString(),
			deletedAt: null,
		},
		delay: 22.0,
	},
];

const availableAIAgents: AvailableAIAgent[] = [];
const availableHumanAgents: AvailableHumanAgent[] = [
	{
		id: "anthony",
		name: "Anthony",
		image: anthonyAvatar,
		lastSeenAt: new Date().toISOString(),
	},
];

export const HumanAiGraphic = () => {
	const ref = useRef(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: false, margin: "-100px" });
	const [visibleItems, setVisibleItems] = useState<number[]>([]);

	// Auto-scroll to bottom when new items are added
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [visibleItems]);

	useEffect(() => {
		if (isInView) {
			const timeouts: Array<ReturnType<typeof setTimeout>> = [];

			const runAnimation = () => {
				setVisibleItems([]);

				chatSequence.forEach((item, index) => {
					const timeout = setTimeout(() => {
						setVisibleItems((prev) => [...prev, index]);

						// Hide typing indicator after duration
						if (item.type === "typing" && item.duration) {
							const hideTimeout = setTimeout(() => {
								setVisibleItems((prev) => prev.filter((i) => i !== index));
							}, item.duration * 1000);
							timeouts.push(hideTimeout);
						}
					}, item.delay * 1000);
					timeouts.push(timeout);
				});

				// Show conversation for 3 seconds after completion, then fade out and restart
				const fadeOutTimeout = setTimeout(() => {
					setVisibleItems([]);
				}, 28_000);
				timeouts.push(fadeOutTimeout);

				// Restart animation
				const restartTimeout = setTimeout(() => {
					runAnimation();
				}, 30_000);
				timeouts.push(restartTimeout);
			};

			runAnimation();

			return () => {
				for (const timeout of timeouts) {
					clearTimeout(timeout);
				}
			};
		}
		setVisibleItems([]);
	}, [isInView]);

	// Helper to get sender ID from a timeline item
	const getSenderId = (item: TimelineItem): string =>
		item.visitorId || item.aiAgentId || item.userId || "";

	// Helper to find the last visible timeline item before the given index
	const findLastVisibleTimelineItem = (
		beforeIndex: number
	): { index: number; senderId: string } | null => {
		for (let i = beforeIndex - 1; i >= 0; i--) {
			const sequenceItem = chatSequence[i];
			if (
				sequenceItem &&
				sequenceItem.type === "timeline_item" &&
				visibleItems.includes(i)
			) {
				const timelineItem = (
					sequenceItem as ChatSequenceItem & { type: "timeline_item" }
				).item;
				return { index: i, senderId: getSenderId(timelineItem) };
			}
		}
		return null;
	};

	// Helper to count visible timeline items from a sender in a range
	const countVisibleTimelineItemsFromSender = (
		startIndex: number,
		endIndex: number,
		senderId: string
	): number => {
		let count = 0;
		for (let i = startIndex; i < endIndex; i++) {
			const sequenceItem = chatSequence[i];
			if (
				sequenceItem &&
				sequenceItem.type === "timeline_item" &&
				visibleItems.includes(i)
			) {
				const timelineItem = (
					sequenceItem as ChatSequenceItem & { type: "timeline_item" }
				).item;
				if (getSenderId(timelineItem) === senderId) {
					count++;
				}
			}
		}
		return count;
	};

	// Helper to check if timeline item was already rendered in a group
	const isTimelineItemAlreadyGrouped = (index: number): boolean => {
		if (index === 0) {
			return false;
		}

		const currentItem = chatSequence[index];
		if (!currentItem || currentItem.type !== "timeline_item") {
			return false;
		}

		const currentTimelineItem = (
			currentItem as ChatSequenceItem & { type: "timeline_item" }
		).item;
		const currentSenderId = getSenderId(currentTimelineItem);

		// Find the last visible timeline item before this one
		const lastTimelineItem = findLastVisibleTimelineItem(index);
		if (!lastTimelineItem) {
			return false;
		}

		// If the last item is from a different sender, this starts a new group
		if (lastTimelineItem.senderId !== currentSenderId) {
			return false;
		}

		// Count how many items from this sender are between the last item and current
		const itemCount = countVisibleTimelineItemsFromSender(
			lastTimelineItem.index,
			index,
			currentSenderId
		);

		// If there's already 1 item from this sender, this would be the 2nd
		return itemCount >= 1;
	};

	// Helper to collect consecutive timeline items from the same sender
	const collectGroupedTimelineItems = (
		startIndex: number,
		senderId: string
	): TimelineItem[] => {
		const items: TimelineItem[] = [];
		let currentIndex = startIndex;

		while (currentIndex < chatSequence.length && items.length < 2) {
			const currentItem = chatSequence[currentIndex];

			// Skip if item is not visible
			if (!visibleItems.includes(currentIndex)) {
				currentIndex++;
				continue;
			}

			// If it's a timeline item
			if (currentItem && currentItem.type === "timeline_item") {
				const timelineItem = currentItem as ChatSequenceItem & {
					type: "timeline_item";
				};

				// If it's from a different sender, stop collecting
				if (getSenderId(timelineItem.item) !== senderId) {
					break;
				}

				// Add the item to our collection
				items.push({
					...timelineItem.item,
					id: timelineItem.item.id || `item-${currentIndex}`,
				});
			}
			// If it's not a timeline item (typing indicator, event, etc.), skip it

			currentIndex++;
		}

		return items;
	};

	// Helper to render a timeline message group
	const renderTimelineMessageGroup = (items: TimelineItem[], index: number) => (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			initial={{ opacity: 0, y: 10 }}
			key={`timeline-group-${index}`}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			<TimelineMessageGroup
				availableAIAgents={availableAIAgents}
				availableHumanAgents={availableHumanAgents}
				currentVisitorId="visitor"
				items={items}
			/>
		</motion.div>
	);

	// Helper to render typing indicator
	const renderTypingIndicator = (
		item: ChatSequenceItem & { type: "typing" },
		index: number
	) => (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			initial={{ opacity: 0, y: 10 }}
			key={`typing-${index}`}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			<div className="flex items-center gap-2">
				{item.senderType === SenderType.AI ? (
					<div className="flex size-6 items-center justify-center rounded-full bg-primary/10">
						<Logo className="h-4 w-4 text-primary" />
					</div>
				) : (
					<div className="flex flex-col justify-end">
						<div className="size-6 overflow-hidden rounded-full">
							{/** biome-ignore lint/performance/noImgElement: ok */}
							<img
								alt={item.aiAgentId ?? ""}
								className="h-full w-full object-cover"
								src={
									availableHumanAgents.find((agent) => agent.id === item.userId)
										?.image ?? ""
								}
							/>
						</div>
					</div>
				)}
				<div className="flex flex-col gap-1">
					<div className="rounded-lg rounded-bl-sm bg-co-background-200 px-3 py-2">
						<div className="flex gap-1">
							<span className="dot-bounce-1 size-1 rounded-full bg-primary" />
							<span className="dot-bounce-2 size-1 rounded-full bg-primary" />
							<span className="dot-bounce-3 size-1 rounded-full bg-primary" />
						</div>
					</div>
				</div>
			</div>
		</motion.div>
	);

	// biome-ignore lint/suspicious/noExplicitAny: demo we don't care here
	const renderItem = (item: any, index: number) => {
		if (!visibleItems.includes(index)) {
			return null;
		}

		if (item.type === "timeline_item") {
			// Skip if this item was already rendered as part of a previous group
			if (isTimelineItemAlreadyGrouped(index)) {
				return null;
			}

			const senderId = getSenderId(item.item);
			const items = collectGroupedTimelineItems(index, senderId);

			return renderTimelineMessageGroup(items, index);
		}

		if (item.type === "event") {
			return (
				<ConversationEvent
					availableAIAgents={availableAIAgents}
					availableHumanAgents={availableHumanAgents}
					createdAt={item.createdAt}
					event={item.event}
					key={`event-${index}`}
				/>
			);
		}

		if (item.type === "typing") {
			return renderTypingIndicator(item, index);
		}

		return null;
	};

	return (
		<SupportTextProvider locale="en">
			<div className="relative h-[300px] w-full overflow-hidden pb-6">
				<div className="pointer-events-none absolute top-0 right-0 left-0 h-8 bg-gradient-to-b from-background to-transparent" />

				<div
					className="flex h-full w-full flex-col gap-4 overflow-hidden p-4 pt-0"
					ref={scrollRef}
				>
					<div className="flex flex-1 flex-col justify-end gap-3" ref={ref}>
						{chatSequence.map((item, index) => renderItem(item, index))}
					</div>
				</div>
				<div className="pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-background to-transparent" />
			</div>
		</SupportTextProvider>
	);
};
