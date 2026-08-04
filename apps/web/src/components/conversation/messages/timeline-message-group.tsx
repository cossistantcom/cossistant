import type { RouterOutputs } from "@api/trpc/types";
import {
	getTimelineItemTranslation,
	shouldTranslateBetweenLanguages,
} from "@cossistant/core";
import {
	TimelineItemGroup as PrimitiveTimelineItemGroup,
	TimelineItemGroupAvatar,
	TimelineItemGroupContent,
	TimelineItemGroupHeader,
} from "@cossistant/next/primitives";
import type { AvailableAIAgent, VisitorPresenceEntry } from "@cossistant/types";
import { SenderType } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { ConversationSeen } from "@cossistant/types/schemas";
import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import type React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ButtonWithPaywall } from "@/components/plan/button-with-paywall";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import type { ConversationHeader } from "@/contexts/inboxes";
import { useOptionalWebsite } from "@/contexts/website";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import { ReadIndicator } from "./read-indicator";
import { TimelineMessageItem } from "./timeline-message-item";

const MESSAGE_ANIMATION = {
	initial: { opacity: 0, y: 6 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0 },
	transition: {
		duration: 0.1,
		ease: [0.25, 0.46, 0.45, 0.94] as const, // easeOutCubic
	},
} as const;

type TimelineMessageGroupProps = {
	items: TimelineItem[];
	availableAIAgents: AvailableAIAgent[];
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	conversationVisitorLanguage?: string | null;
	lastReadMessageIds?: Map<string, string>; // Map of userId -> lastMessageId they read
	currentUserId?: string;
	visitor: ConversationHeader["visitor"];
	visitorPresence?: VisitorPresenceEntry | null;
	seenData?: ConversationSeen[];
	formatTimestamp?: (date: Date) => string;
};

export function TimelineMessageGroup({
	items,
	availableAIAgents,
	teamMembers,
	conversationVisitorLanguage,
	lastReadMessageIds,
	currentUserId,
	visitor,
	visitorPresence,
	seenData,
	formatTimestamp,
}: TimelineMessageGroupProps) {
	const website = useOptionalWebsite();
	const trpc = useTRPC();
	const [showOriginal, setShowOriginal] = useState(false);
	// Get agent info for the sender
	const firstItem = items[0];
	const humanAgent = teamMembers.find(
		(agent) => agent.id === firstItem?.userId
	);
	const humanDisplay = firstItem?.userId
		? resolveDashboardHumanAgentDisplay({
				email: humanAgent?.email ?? null,
				id: humanAgent?.id ?? firstItem.userId,
				name: humanAgent?.name ?? null,
			})
		: null;
	const aiAgent = availableAIAgents.find(
		(agent) => agent.id === firstItem?.aiAgentId
	);
	const visitorName = getVisitorNameWithFallback(visitor);
	const isVisitorGroup =
		Boolean(firstItem?.visitorId) &&
		!firstItem?.userId &&
		!firstItem?.aiAgentId;
	const translatedVisitorItemCount = useMemo(
		() =>
			items.filter(
				(item) => item.visitorId && getTimelineItemTranslation(item, "team")
			).length,
		[items]
	);
	const visitorTranslatableMessageIds = useMemo(
		() =>
			items
				.filter(
					(item) =>
						item.visitorId &&
						item.text?.trim() &&
						!getTimelineItemTranslation(item, "team")
				)
				.map((item) => item.id)
				.filter((id): id is string => Boolean(id)),
		[items]
	);
	const canOfferGroupTranslate =
		isVisitorGroup &&
		Boolean(website) &&
		visitorTranslatableMessageIds.length > 0 &&
		shouldTranslateBetweenLanguages(
			conversationVisitorLanguage,
			website?.defaultLanguage
		);
	const canToggleOriginal = isVisitorGroup && translatedVisitorItemCount > 0;
	const { mutateAsync: translateMessageGroup, isPending: isTranslatingGroup } =
		useMutation(
			trpc.conversation.translateMessageGroup.mutationOptions({
				onSuccess: () => {
					setShowOriginal(false);
				},
			})
		);

	// Check if any message in the group was sent via email
	const isFromEmail = useMemo(
		() =>
			items.some((item) =>
				item.parts?.some(
					(part) =>
						typeof part === "object" &&
						part !== null &&
						"type" in part &&
						part.type === "metadata" &&
						"source" in part &&
						part.source === "email"
				)
			),
		[items]
	);

	if (items.length === 0) {
		return null;
	}

	const handleTranslateGroup = async () => {
		if (!(firstItem?.conversationId && website)) {
			toast.error("These messages cannot be translated right now.");
			return;
		}

		try {
			await translateMessageGroup({
				conversationId: firstItem.conversationId,
				websiteSlug: website.slug,
				timelineItemIds: visitorTranslatableMessageIds,
			});
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to translate these messages right now."
			);
		}
	};

	return (
		<PrimitiveTimelineItemGroup
			items={items}
			lastReadItemIds={lastReadMessageIds}
			viewerId={currentUserId}
			viewerType={SenderType.TEAM_MEMBER}
		>
			{({ isSentByViewer, isReceivedByViewer, isVisitor, isAI }) => {
				const lastItem = items.at(-1);

				return (
					<>
						<div
							className={cn(
								"flex w-full gap-2",
								// From dashboard POV: visitor messages are received (left side)
								// Team member/AI messages sent by viewer are on right side
								isSentByViewer && "flex-row-reverse",
								isReceivedByViewer && "flex-row"
							)}
						>
							{/* Avatar - only show for received messages */}
							{isReceivedByViewer && (
								<TimelineItemGroupAvatar className="flex shrink-0 flex-col justify-end">
									{isVisitor ? (
										<Avatar
											className="size-6"
											fallbackName={visitorName}
											lastOnlineAt={
												visitorPresence?.lastSeenAt ?? visitor?.lastSeenAt
											}
											status={visitorPresence?.status}
											url={visitor?.contact?.image}
										/>
									) : isAI ? (
										aiAgent?.image ? (
											<Avatar
												className="size-6"
												fallbackName={aiAgent.name || "AI Assistant"}
												url={aiAgent.image}
											/>
										) : (
											<div
												className={cn(
													"flex size-6 shrink-0 items-center justify-center"
												)}
											>
												<Logo className="size-5 text-primary/90" />
											</div>
										)
									) : (
										<Avatar
											className="size-6"
											facehashSeed={humanDisplay?.facehashSeed}
											fallbackName={humanDisplay?.displayName ?? "Team member"}
											lastOnlineAt={humanAgent?.lastSeenAt}
											url={humanAgent?.image}
										/>
									)}
								</TimelineItemGroupAvatar>
							)}

							<TimelineItemGroupContent
								className={cn(
									"flex flex-col gap-1 pb-1.5",
									isSentByViewer && "items-end"
								)}
							>
								{/* Header - show sender name for received messages */}
								{isReceivedByViewer && (
									<TimelineItemGroupHeader className="mb-2 px-1 text-muted-foreground text-xs">
										{isVisitor
											? visitorName
											: isAI
												? aiAgent?.name || "AI Assistant"
												: (humanDisplay?.displayName ?? "Team member")}
										{isFromEmail && " via email"}
									</TimelineItemGroupHeader>
								)}

								{/* Timeline items */}
								{items.map((item, index) => (
									<motion.div
										className="relative"
										key={item.id}
										{...MESSAGE_ANIMATION}
									>
										<TimelineMessageItem
											isLast={index === items.length - 1}
											isSentByViewer={isSentByViewer}
											item={item}
											showOriginal={showOriginal}
										/>
									</motion.div>
								))}

								{lastItem ? (
									<div
										className="mt-1 flex items-center gap-1 px-1 text-muted-foreground text-xs"
										data-translation-group-footer="true"
									>
										<span>
											{formatTimestamp
												? formatTimestamp(new Date(lastItem.createdAt))
												: new Date(lastItem.createdAt).toLocaleTimeString([], {
														hour: "2-digit",
														minute: "2-digit",
													})}
											{isAI && " • AI agent"}
										</span>
										{canOfferGroupTranslate ? (
											<>
												<span aria-hidden="true">•</span>
												<ButtonWithPaywall
													className="h-auto p-0 text-muted-foreground text-xs hover:bg-transparent hover:text-foreground"
													data-translation-group-action="translate"
													disabled={isTranslatingGroup}
													featureKey="auto-translate"
													onClick={handleTranslateGroup}
													size="sm"
													type="button"
													variant="ghost"
													websiteSlug={website?.slug ?? ""}
												>
													{isTranslatingGroup ? "Translating..." : "Translate"}
												</ButtonWithPaywall>
											</>
										) : canToggleOriginal ? (
											<>
												<span aria-hidden="true">•</span>
												<Button
													className="h-auto p-0 text-muted-foreground text-xs hover:bg-transparent hover:text-foreground"
													data-translation-group-action="toggle-original"
													onClick={() => setShowOriginal((current) => !current)}
													size="sm"
													type="button"
													variant="ghost"
												>
													{showOriginal ? "Show translation" : "Show original"}
												</Button>
											</>
										) : null}
									</div>
								) : null}
							</TimelineItemGroupContent>
						</div>

						{/* Read indicator - rendered outside the flex container to not affect avatar alignment */}
						{lastItem?.id && (
							<ReadIndicator
								availableAIAgents={availableAIAgents}
								currentUserId={currentUserId}
								firstMessage={firstItem}
								lastReadMessageIds={lastReadMessageIds}
								messageId={lastItem.id}
								messages={items}
								seenData={seenData}
								teamMembers={teamMembers}
								visitor={visitor}
							/>
						)}
					</>
				);
			}}
		</PrimitiveTimelineItemGroup>
	);
}
