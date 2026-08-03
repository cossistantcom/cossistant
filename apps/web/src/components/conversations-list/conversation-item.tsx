"use client";

import type { RouterOutputs } from "@api/trpc/types";
import {
	formatFeedbackReviewPreview,
	getTimelineItemFeedback,
	resolveTimelineItemText,
} from "@cossistant/core";
import { useConversationTyping } from "@cossistant/react/hooks";
import { formatMessagePreview } from "@cossistant/tiny-markdown/utils";
import {
	ConversationStatus,
	ConversationTimelineType,
} from "@cossistant/types";
import { useQueryNormalizer } from "@normy/react-query";
import { useQuery } from "@tanstack/react-query";
import { differenceInHours } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { TooltipOnHover } from "@/components/ui/tooltip";
import type { ConversationHeader } from "@/contexts/inboxes";
import { useVisitorPresenceById } from "@/contexts/visitor-presence";
import { useUserSession, useWebsiteMembers } from "@/contexts/website";
import { useLatestConversationMessage } from "@/data/use-latest-conversation-message";
import { usePrefetchContactVisitorDetail } from "@/data/use-prefetch-contact-visitor-detail";
import { usePrefetchConversationData } from "@/data/use-prefetch-conversation-data";
import { useContactVisitorDetailState } from "@/hooks/use-contact-visitor-detail-state";
import { isInboundVisitorMessage } from "@/lib/conversation-messages";
import { formatTimeAgo, getWaitingSinceLabel } from "@/lib/date";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import {
	buildTimelineEventPreview,
	extractEventPart,
} from "@/lib/timeline-events";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import { ConversationBasicActions } from "../conversation/actions/basic";
import { BouncingDots } from "../conversation/messages/typing-indicator";
import { Logo } from "../ui/logo";
import { LockedConversationPreview } from "./locked-conversation-preview";
import { resolveConversationItemDetailTarget } from "./resolve-conversation-item-detail-target";

type ConversationItemViewProps = {
	visitorName: string;
	visitorAvatarUrl?: string | null;
	visitorPresenceStatus?: "online" | "away";
	visitorLastSeenAt?: string | null;
	title?: string | null;
	lastTimelineContent: ReactNode;
	lastTimelineItemCreatedAt?: Date | null;
	timeDisplayOverrideAt?: Date | null;
	isTyping: boolean;
	isAITyping?: boolean;
	isLastMessageFromAI?: boolean;
	waitingSinceLabel?: string | null;
	needsHumanIntervention?: boolean;
	needsClarification?: boolean;
	hasUnreadMessage: boolean;
	focused?: boolean;
	rightContent?: ReactNode;
	className?: string;
	onMouseEnter?: () => void;
	onAvatarHoverOrFocus?: () => void;
	onClick?: () => void;
	onAvatarClick?: () => void;
	href?: string;
	locked?: boolean;
};

type ConversationItemTimelinePreviewParams = {
	item: NonNullable<ConversationHeader["lastTimelineItem"]>;
	availableAIAgents: Parameters<
		typeof buildTimelineEventPreview
	>[0]["availableAIAgents"];
	availableHumanAgents: Parameters<
		typeof buildTimelineEventPreview
	>[0]["availableHumanAgents"];
	visitor: Parameters<typeof buildTimelineEventPreview>[0]["visitor"];
};

export function resolveConversationItemTimelinePreview({
	item,
	availableAIAgents,
	availableHumanAgents,
	visitor,
}: ConversationItemTimelinePreviewParams): string {
	const feedback = getTimelineItemFeedback(item);
	if (feedback) {
		return formatFeedbackReviewPreview(feedback.rating);
	}

	if (item.type === ConversationTimelineType.EVENT) {
		const eventPart = extractEventPart(item);

		if (!eventPart) {
			return "";
		}

		return buildTimelineEventPreview({
			event: eventPart,
			availableAIAgents,
			availableHumanAgents,
			visitor,
		});
	}

	return formatMessagePreview(resolveTimelineItemText(item, "team") ?? "");
}

export function ConversationItemView({
	visitorName,
	visitorAvatarUrl,
	visitorPresenceStatus,
	visitorLastSeenAt,
	title,
	lastTimelineContent,
	lastTimelineItemCreatedAt,
	timeDisplayOverrideAt,
	isTyping,
	isAITyping = false,
	isLastMessageFromAI = false,
	waitingSinceLabel,
	needsHumanIntervention = false,
	needsClarification = false,
	hasUnreadMessage,
	focused = false,
	rightContent,
	className,
	onMouseEnter,
	onAvatarHoverOrFocus,
	onClick,
	onAvatarClick,
	href,
	locked = false,
}: ConversationItemViewProps) {
	const [isMounted, setIsMounted] = useState(false);
	const [formattedTime, setFormattedTime] = useState<string | null>(null);

	useEffect(() => {
		setIsMounted(true);
		const timestampToDisplay =
			timeDisplayOverrideAt ?? lastTimelineItemCreatedAt;
		if (timestampToDisplay) {
			setFormattedTime(formatTimeAgo(timestampToDisplay));
			return;
		}
		setFormattedTime(null);
	}, [lastTimelineItemCreatedAt, timeDisplayOverrideAt]);

	const avatar = (
		<Avatar
			className="size-8"
			fallbackName={visitorName}
			lastOnlineAt={visitorLastSeenAt}
			status={visitorPresenceStatus}
			tooltipContent={null}
			url={visitorAvatarUrl}
		/>
	);
	const detailsButton = onAvatarClick ? (
		<TooltipOnHover content="Click to get more details" delay={150}>
			<button
				aria-label={`Open details for ${visitorName}`}
				className="size-8 cursor-pointer rounded-[2px] transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				data-slot="conversation-item-avatar-trigger"
				onClick={onAvatarClick}
				onFocus={onAvatarHoverOrFocus}
				onMouseEnter={onAvatarHoverOrFocus}
				type="button"
			>
				{avatar}
			</button>
		</TooltipOnHover>
	) : (
		avatar
	);

	const mainContent = (
		<>
			<div className="flex min-w-0 flex-1 items-center gap-1 md:gap-4">
				<p className="min-w-[140px] max-w-[140px] shrink-0 truncate capitalize">
					{visitorName}
				</p>

				<div className="flex min-w-0 flex-1 items-center gap-4 pr-6">
					{title && (
						<span className="max-w-[40%] shrink-0 truncate font-medium">
							{title}
						</span>
					)}
					{isTyping ? (
						<div className="flex min-w-0 shrink-0 items-center gap-2">
							{isAITyping && <Logo className="size-3.5" />}
							<BouncingDots />
						</div>
					) : (
						<span
							className={cn(
								"hidden min-w-0 flex-1 items-center gap-2 truncate md:inline-flex",
								hasUnreadMessage ? "text-primary" : "text-muted-foreground"
							)}
						>
							{isLastMessageFromAI && <Logo className="size-3.5 shrink-0" />}
							{lastTimelineContent}
						</span>
					)}
				</div>
			</div>
			<div className="flex items-center gap-3">
				{locked ? (
					<span className="shrink-0 font-medium text-cossistant-orange text-xs leading-none">
						locked
					</span>
				) : needsHumanIntervention ? (
					<span className="shrink-0 font-medium text-cossistant-orange text-xs leading-none">
						Needs human
					</span>
				) : needsClarification ? (
					<span className="shrink-0 font-medium text-cossistant-orange text-xs leading-none">
						Clarification needed
					</span>
				) : waitingSinceLabel ? (
					<span className="shrink-0 font-medium text-cossistant-orange text-xs leading-none">
						{waitingSinceLabel} waiting
					</span>
				) : null}
				<div className="flex min-w-[102px] items-center justify-end gap-1">
					{rightContent ||
						(isMounted && formattedTime ? (
							<span className="shrink-0 pr-2 text-primary/40 text-xs">
								{formattedTime}
							</span>
						) : null)}
					<span
						aria-hidden="true"
						className={cn(
							"inline-block size-1.5 rounded-full bg-cossistant-orange opacity-0",
							hasUnreadMessage && "opacity-100"
						)}
					/>
				</div>
			</div>
		</>
	);

	const baseClasses = cn(
		"group/conversation-item relative flex w-full min-w-0 items-center justify-start gap-3 rounded px-2 py-2 text-left text-sm",
		"appearance-none border-0 bg-transparent",
		"focus-visible:outline-none focus-visible:ring-0",
		focused && "bg-background-200 text-primary dark:bg-background-300",
		className
	);
	const contentClasses =
		"flex min-w-0 flex-1 items-center justify-between gap-3 appearance-none border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-0";

	if (href && !locked) {
		return (
			<div className={baseClasses}>
				{detailsButton}
				<Link
					className={contentClasses}
					href={href}
					onMouseEnter={onMouseEnter}
					prefetch="auto"
				>
					{mainContent}
				</Link>
			</div>
		);
	}

	if (locked) {
		return (
			<div className={baseClasses}>
				{detailsButton}
				<button
					className={contentClasses}
					onClick={onClick}
					onMouseEnter={onMouseEnter}
					type="button"
				>
					{mainContent}
				</button>
			</div>
		);
	}

	if (onMouseEnter) {
		return (
			<div className={baseClasses}>
				{detailsButton}
				<button
					className={contentClasses}
					onMouseEnter={onMouseEnter}
					type="button"
				>
					{mainContent}
				</button>
			</div>
		);
	}

	return (
		<div className={baseClasses}>
			{detailsButton}
			<div className={contentClasses}>{mainContent}</div>
		</div>
	);
}

type Props = {
	href: string;
	header: ConversationHeader;
	websiteSlug: string;
	focused?: boolean;
	setFocused?: () => void;
	showWaitingForReplyPill?: boolean;
	isSmartMode?: boolean;
	onLockedActivate?: (conversationId: string) => void;
};

export function ConversationItem({
	href,
	header,
	websiteSlug,
	focused = false,
	setFocused,
	showWaitingForReplyPill = false,
	isSmartMode = false,
	onLockedActivate,
}: Props) {
	const queryNormalizer = useQueryNormalizer();
	const {
		visitor: headerVisitor,
		lastTimelineItem: headerLastTimelineItem,
		lastMessageTimelineItem: headerLastMessageTimelineItem,
	} = header;
	const isLocked = Boolean(header.dashboardLocked);
	const { prefetchConversation } = usePrefetchConversationData();
	const { prefetchDetail } = usePrefetchContactVisitorDetail({ websiteSlug });
	const { user } = useUserSession();
	const members = useWebsiteMembers();
	const trpc = useTRPC();
	const presence = useVisitorPresenceById(header.visitorId);
	const { openContactDetail, openVisitorDetail } =
		useContactVisitorDetailState();

	const availableHumanAgents = useMemo(
		() =>
			members.map((member) => {
				const memberDisplay = resolveDashboardHumanAgentDisplay(member);

				return {
					id: member.id,
					name: memberDisplay.displayName,
					email: member.email ?? null,
					image: member.image,
					lastSeenAt: member.lastSeenAt,
				};
			}),
		[members]
	);

	const availableAIAgents = useMemo(() => [], []);

	const visitorQueryOptions = useMemo(
		() =>
			trpc.conversation.getVisitorById.queryOptions({
				websiteSlug,
				visitorId: header.visitorId,
			}),
		[header.visitorId, trpc, websiteSlug]
	);

	const visitorPlaceholder = useMemo<
		RouterOutputs["conversation"]["getVisitorById"] | undefined
	>(() => {
		if (!header.visitorId) {
			return;
		}

		return queryNormalizer.getObjectById<
			RouterOutputs["conversation"]["getVisitorById"]
		>(header.visitorId);
	}, [header.visitorId, queryNormalizer]);

	const visitorQuery = useQuery({
		...visitorQueryOptions,
		enabled: Boolean(header.visitorId),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		placeholderData: visitorPlaceholder,
	});

	// Normalize visitor data when query completes for consistent access across components
	useEffect(() => {
		if (visitorQuery.data) {
			queryNormalizer.setNormalizedData(
				visitorQuery.data as Parameters<
					typeof queryNormalizer.setNormalizedData
				>[0]
			);
		}
	}, [visitorQuery.data, queryNormalizer]);

	const visitor = useMemo(() => {
		const normalizedVisitor = visitorQuery.data ?? null;

		// Prefer normalized visitor data when available as it's more complete
		return normalizedVisitor ?? headerVisitor;
	}, [headerVisitor, visitorQuery.data]);

	const detailTarget = useMemo(
		() =>
			resolveConversationItemDetailTarget({
				headerVisitor,
				visitor,
				visitorId: header.visitorId,
			}),
		[header.visitorId, headerVisitor, visitor]
	);

	const handleAvatarClick = useCallback(() => {
		if (!detailTarget) {
			return;
		}

		if (detailTarget.type === "contact") {
			void openContactDetail(detailTarget.id);
			return;
		}

		void openVisitorDetail(detailTarget.id);
	}, [detailTarget, openContactDetail, openVisitorDetail]);

	const handleDetailPrefetch = useCallback(() => {
		if (!detailTarget) {
			return;
		}

		void prefetchDetail(detailTarget);
	}, [detailTarget, prefetchDetail]);

	const typingEntries = useConversationTyping(header.id, {
		excludeUserId: user.id,
	});

	const typingInfo = useMemo(() => {
		if (typingEntries.length === 0) {
			return null;
		}

		const entry = typingEntries[0];

		// Visitor typing - requires visitor data
		if (entry?.actorType === "visitor" && visitor) {
			return {
				name: visitor.contact?.name || visitor.contact?.email || "Visitor",
				hasPreview: !!entry.preview,
			};
		}

		// AI agent typing
		if (entry?.actorType === "ai_agent") {
			return {
				name: "AI Agent",
				hasPreview: false,
			};
		}

		// Team member typing - look up member name
		if (entry?.actorType === "user") {
			const member = members.find((m) => m.id === entry.actorId);
			const memberDisplay = resolveDashboardHumanAgentDisplay({
				email: member?.email ?? null,
				id: member?.id ?? entry.actorId,
				name: member?.name ?? null,
			});
			return {
				name: memberDisplay.displayName,
				hasPreview: false,
			};
		}

		return null;
	}, [typingEntries, visitor, members]);

	const isAITyping = useMemo(
		() => typingEntries.some((entry) => entry.actorType === "ai_agent"),
		[typingEntries]
	);

	const cachedLastTimelineItem = useLatestConversationMessage({
		conversationId: header.id,
		websiteSlug,
	});

	const lastTimelineItem =
		cachedLastTimelineItem ??
		headerLastMessageTimelineItem ??
		headerLastTimelineItem ??
		null;

	const lastTimelineItemCreatedAt = lastTimelineItem?.createdAt
		? new Date(lastTimelineItem.createdAt)
		: null;

	const lastTimelinePreview = useMemo(() => {
		if (!lastTimelineItem) {
			return "";
		}

		return resolveConversationItemTimelinePreview({
			item: lastTimelineItem,
			availableAIAgents,
			availableHumanAgents,
			visitor,
		});
	}, [availableAIAgents, availableHumanAgents, lastTimelineItem, visitor]);

	const isEventPreview = Boolean(
		lastTimelineItem?.type === ConversationTimelineType.EVENT &&
			lastTimelinePreview
	);

	const lastTimelineContent = useMemo<ReactNode>(() => {
		if (isLocked) {
			return <LockedConversationPreview conversationId={header.id} />;
		}

		if (!lastTimelineItem) {
			return "";
		}

		if (isEventPreview) {
			return (
				<>
					<span className="shrink-0 rounded-full bg-background-300 px-2 py-0.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-tight">
						Event
					</span>
					<span className="truncate">{lastTimelinePreview}</span>
				</>
			);
		}

		return <span className="truncate">{lastTimelinePreview}</span>;
	}, [isEventPreview, isLocked, lastTimelineItem, lastTimelinePreview]);

	const shouldDisplayWaitingPill =
		showWaitingForReplyPill &&
		header.status === ConversationStatus.OPEN &&
		!header.deletedAt;

	const inboundWaitingTimelineItem = useMemo(() => {
		if (!shouldDisplayWaitingPill) {
			return null;
		}

		return isInboundVisitorMessage(lastTimelineItem) ? lastTimelineItem : null;
	}, [lastTimelineItem, shouldDisplayWaitingPill]);

	const waitingSinceLabel = useMemo(() => {
		if (!inboundWaitingTimelineItem) {
			return null;
		}

		const messageDate = new Date(inboundWaitingTimelineItem.createdAt);
		const now = new Date();
		const hoursAgo = differenceInHours(now, messageDate);

		// Only show waiting label if message is older than 8 hours
		if (hoursAgo < 8) {
			return null;
		}

		return getWaitingSinceLabel(messageDate);
	}, [inboundWaitingTimelineItem]);

	// Check if AI escalated and human hasn't handled it yet
	const needsHumanIntervention = useMemo(
		() => Boolean(header.escalatedAt && !header.escalationHandledAt),
		[header.escalatedAt, header.escalationHandledAt]
	);
	const needsClarification = useMemo(
		() => Boolean(header.activeClarification) && !needsHumanIntervention,
		[header.activeClarification, needsHumanIntervention]
	);

	const headerLastSeenAt = header.lastSeenAt
		? new Date(header.lastSeenAt)
		: null;

	const isLastTimelineItemFromCurrentUser =
		lastTimelineItem?.userId === user.id;

	const isLastMessageFromAI = Boolean(lastTimelineItem?.aiAgentId);

	const hasUnreadMessage = Boolean(
		!isLocked &&
			lastTimelineItem &&
			!isLastTimelineItemFromCurrentUser &&
			lastTimelineItemCreatedAt &&
			(!headerLastSeenAt || lastTimelineItemCreatedAt > headerLastSeenAt)
	);

	const fullName = getVisitorNameWithFallback(visitor ?? headerVisitor);

	const lockedTimeDisplayAt = useMemo(
		() => (isLocked ? new Date(header.createdAt) : null),
		[header.createdAt, isLocked]
	);

	// In smart mode, hide "needs human" badge since category header provides this info
	// But show waiting time label in orange when conversation is in "long waiting" category
	const showNeedsHuman = !isSmartMode && needsHumanIntervention;
	const showNeedsClarification =
		!(isSmartMode || needsHumanIntervention) && needsClarification;
	// In smart mode, show waiting label inline (without "Waiting for" prefix)
	const showWaitingLabel = waitingSinceLabel;

	return (
		<ConversationItemView
			focused={focused}
			hasUnreadMessage={hasUnreadMessage}
			href={isLocked ? undefined : href}
			isAITyping={isAITyping}
			isLastMessageFromAI={isLastMessageFromAI}
			isTyping={Boolean(typingInfo)}
			lastTimelineContent={lastTimelineContent}
			lastTimelineItemCreatedAt={lastTimelineItemCreatedAt}
			locked={isLocked}
			needsClarification={showNeedsClarification}
			needsHumanIntervention={showNeedsHuman}
			onAvatarClick={detailTarget ? handleAvatarClick : undefined}
			onAvatarHoverOrFocus={detailTarget ? handleDetailPrefetch : undefined}
			onClick={isLocked ? () => onLockedActivate?.(header.id) : undefined}
			onMouseEnter={() => {
				setFocused?.();
				if (!isLocked) {
					prefetchConversation({
						websiteSlug,
						conversationId: header.id,
						visitorId: header.visitorId,
					});
				}
			}}
			rightContent={
				focused && !isLocked ? (
					<ConversationBasicActions
						conversationId={header.id}
						deletedAt={header.deletedAt}
						enableKeyboardShortcuts
						hasUnreadMessage={hasUnreadMessage}
						status={header.status}
						visitorId={header.visitorId}
					/>
				) : null
			}
			timeDisplayOverrideAt={lockedTimeDisplayAt}
			title={header.title}
			visitorAvatarUrl={
				visitor?.contact?.image ?? headerVisitor?.contact?.image ?? null
			}
			visitorLastSeenAt={
				presence?.lastSeenAt ??
				visitor?.lastSeenAt ??
				headerVisitor?.lastSeenAt ??
				null
			}
			visitorName={fullName}
			visitorPresenceStatus={presence?.status}
			waitingSinceLabel={showWaitingLabel}
		/>
	);
}
