/** biome-ignore-all lint/correctness/useHookAtTopLevel: ok here */
"use client";

import { FILE_INPUT_ACCEPT } from "@cossistant/core";
import {
	CONVERSATION_AUTO_SEEN_DELAY_MS,
	useWindowVisibilityFocus,
} from "@cossistant/react/hooks";
import { useMultimodalInput } from "@cossistant/react/internal/hooks";
import type { AvailableAIAgent } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import { useQuery } from "@tanstack/react-query";
import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { ConversationProps } from "@/components/conversation";
import { Conversation } from "@/components/conversation";
import type {
	AiPauseAction,
	MessageVisibility,
} from "@/components/conversation/composer";
import { useClarificationComposerFlow } from "@/components/conversation/composer/clarification-composer-flow";
import { ClarificationPrompt } from "@/components/conversation/composer/clarification-teaser";
import { buildConversationComposerViewModel } from "@/components/conversation/composer/composer-view-model";
import type { ConversationHeaderNavigationProps } from "@/components/conversation/header/navigation";
import { resolveConversationClarificationDisplayState } from "@/components/knowledge-clarification/conversation-state";
import { ButtonWithPaywall } from "@/components/plan/button-with-paywall";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import Icon from "@/components/ui/icons";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { useInboxes } from "@/contexts/inboxes";
import { useWebsiteMembers } from "@/contexts/website";
import { useConversationActions } from "@/data/use-conversation-actions";
import { useConversationTimelineItems } from "@/data/use-conversation-timeline-items";
import { usePrefetchConversationData } from "@/data/use-prefetch-conversation-data";
import { useVisitor } from "@/data/use-visitor";
import { useAgentTypingReporter } from "@/hooks/use-agent-typing-reporter";
import { useConversationSeen } from "@/hooks/use-conversation-seen";
import { useDashboardNewMessageSound } from "@/hooks/use-dashboard-new-message-sound";
import { useSendConversationMessage } from "@/hooks/use-send-conversation-message";
import { useSidebar } from "@/hooks/use-sidebars";
import { useSoundPreferences } from "@/hooks/use-sound-preferences";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const MESSAGES_PAGE_LIMIT = 50;
const AI_PAUSE_FURTHER_NOTICE_MINUTES = 60 * 24 * 365 * 99;

type ConversationPaneProps = {
	conversationId: string;
	visitorId: string;
	websiteSlug: string;
	currentUserId: string;
};

export function ConversationPane({
	conversationId,
	visitorId,
	websiteSlug,
	currentUserId,
}: ConversationPaneProps) {
	const trpc = useTRPC();
	const { newMessageEnabled } = useSoundPreferences({ websiteSlug });
	const { data: planInfo, refetch: refetchPlanInfo } = useQuery(
		trpc.plan.getPlanInfo.queryOptions({ websiteSlug })
	);
	const [messageLimitLatched, setMessageLimitLatched] = useState(false);
	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

	// Fetch AI agent for the website to display proper names in events
	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({ websiteSlug })
	);
	const { data: activeClarificationData, refetch: refetchActiveClarification } =
		useQuery(
			trpc.knowledgeClarification.getActiveForConversation.queryOptions({
				websiteSlug,
				conversationId,
			})
		);
	const [engagedClarificationRequestId, setEngagedClarificationRequestId] =
		useState<string | null>(null);

	// Build availableAIAgents array from fetched AI agent
	const availableAIAgents = useMemo<AvailableAIAgent[]>(() => {
		if (!aiAgent) {
			return [];
		}
		return [
			{
				id: aiAgent.id,
				name: aiAgent.name,
				image: aiAgent.image ?? null,
			},
		];
	}, [aiAgent]);
	const playNewMessageSound = useDashboardNewMessageSound(newMessageEnabled);
	const previousItemsRef = useRef<readonly TimelineItem[]>([]);

	const [messageVisibility, setMessageVisibility] =
		useState<MessageVisibility>("public");
	const hardLimitStatus = planInfo?.hardLimitStatus;
	const messageLimitStatus = planInfo?.hardLimitStatus.messages;
	const hardLimitsEnforced = hardLimitStatus?.enforced ?? true;
	const hardLimitsUnavailableReason =
		hardLimitStatus?.unavailableReason ?? null;
	const isPlanMessageLimitReached = Boolean(messageLimitStatus?.reached);
	const isMessageLimitReached =
		hardLimitsEnforced && (isPlanMessageLimitReached || messageLimitLatched);

	useEffect(() => {
		if (!(hardLimitsEnforced && isPlanMessageLimitReached)) {
			setMessageLimitLatched(false);
		}
	}, [hardLimitsEnforced, isPlanMessageLimitReached]);

	const handleMessageLimitReached = useCallback(() => {
		if (!hardLimitsEnforced) {
			return;
		}

		setMessageLimitLatched(true);
		void refetchPlanInfo();
	}, [hardLimitsEnforced, refetchPlanInfo]);

	// Track markdown-formatted message for submission (with mentions converted)
	const markdownMessageRef = useRef<string>("");

	const {
		submit: submitConversationMessage,
		isUploading,
		uploadProgress,
	} = useSendConversationMessage({
		conversationId,
		websiteSlug,
		currentUserId,
		pageLimit: MESSAGES_PAGE_LIMIT,
		onSendForbidden: handleMessageLimitReached,
	});

	const {
		handleInputChange: handleTypingChange,
		handleSubmit: handleTypingSubmit,
		stop: stopTyping,
	} = useAgentTypingReporter({
		conversationId,
		visitorId,
		websiteSlug,
	});

	const {
		message,
		files,
		isSubmitting,
		error,
		setMessage,
		addFiles,
		removeFile,
		submit,
	} = useMultimodalInput({
		draftPersistenceId: `conversation-composer:${websiteSlug}:${conversationId}`,
		onSubmit: async (payload) => {
			if (isMessageLimitReached) {
				handleMessageLimitReached();
				return;
			}

			handleTypingSubmit();
			// Use the markdown-formatted message (with mentions converted)
			await submitConversationMessage({
				...payload,
				message: markdownMessageRef.current || payload.message,
				visibility: messageVisibility,
			});
			// Clear the markdown ref after submit
			markdownMessageRef.current = "";
		},
		onError: (submitError) => {
			if (
				(
					submitError as {
						data?: {
							code?: string;
						};
					}
				)?.data?.code === "FORBIDDEN"
			) {
				handleMessageLimitReached();
			}

			console.error("Failed to send message", submitError);
		},
	});

	const handleMessageChange = useCallback(
		(value: string) => {
			setMessage(value);
			handleTypingChange(value);
		},
		[handleTypingChange, setMessage]
	);

	// Handle markdown-formatted value from MultimodalInput (with mentions converted)
	const handleMarkdownChange = useCallback((markdownValue: string) => {
		markdownMessageRef.current = markdownValue;
	}, []);

	useEffect(
		() => () => {
			stopTyping();
		},
		[stopTyping]
	);

	const members = useWebsiteMembers();

	const {
		selectedConversation,
		previousConversation,
		nextConversation,
		navigateToPreviousConversation,
		navigateToNextConversation,
		navigateAwayIfNeeded,
		goBack,
		statusCounts,
		selectedConversationIndex,
		conversations,
	} = useInboxes();

	const { prefetchConversation } = usePrefetchConversationData();

	// Proactively prefetch next and previous conversations for instant navigation
	useEffect(() => {
		if (nextConversation) {
			prefetchConversation({
				websiteSlug,
				conversationId: nextConversation.id,
				visitorId: nextConversation.visitorId,
			});
		}
	}, [nextConversation, prefetchConversation, websiteSlug]);

	useEffect(() => {
		if (previousConversation) {
			prefetchConversation({
				websiteSlug,
				conversationId: previousConversation.id,
				visitorId: previousConversation.visitorId,
			});
		}
	}, [previousConversation, prefetchConversation, websiteSlug]);

	const { open: isRightSidebarOpen, toggle: toggleRightSidebar } = useSidebar({
		position: "right",
	});
	const { open: isLeftSidebarOpen, toggle: toggleLeftSidebar } = useSidebar({
		position: "left",
	});

	const handleNavigateAway = useCallback(
		() => navigateAwayIfNeeded(conversationId),
		[navigateAwayIfNeeded, conversationId]
	);

	const {
		markRead,
		joinEscalation,
		pauseAi,
		resumeAi,
		updateTitle,
		updatePriority,
		updateSentiment,
		pendingAction,
	} = useConversationActions({
		conversationId,
		visitorId,
		onNavigateAway: handleNavigateAway,
	});

	const handleAiPauseAction = useCallback(
		(action: AiPauseAction) => {
			switch (action) {
				case "pause_10m":
					void pauseAi(10);
					return;
				case "pause_1h":
					void pauseAi(60);
					return;
				case "pause_further_notice":
					void pauseAi(AI_PAUSE_FURTHER_NOTICE_MINUTES);
					return;
				case "resume_now":
					void resumeAi();
					return;
				default:
					return;
			}
		},
		[pauseAi, resumeAi]
	);

	const handlePriorityChange = useCallback(
		(priority: NonNullable<typeof selectedConversation>["priority"]) => {
			void updatePriority(priority);
		},
		[updatePriority]
	);

	const handleSentimentChange = useCallback(
		(sentiment: NonNullable<typeof selectedConversation>["sentiment"]) => {
			void updateSentiment(sentiment);
		},
		[updateSentiment]
	);

	const lastMarkedMessageIdRef = useRef<string | null>(null);
	const markSeenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { isPageVisible, hasWindowFocus } = useWindowVisibilityFocus();

	const { items, fetchNextPage, hasNextPage } = useConversationTimelineItems({
		conversationId,
		websiteSlug,
		options: { limit: MESSAGES_PAGE_LIMIT },
	});

	const { visitor, isLoading: isVisitorLoading } = useVisitor({
		visitorId,
		websiteSlug,
	});

	const seenData = useConversationSeen(conversationId, {
		initialData: selectedConversation?.seenData ?? [],
	});

	const lastMessage = useMemo(() => {
		for (let index = items.length - 1; index >= 0; index -= 1) {
			const candidate = items[index];
			if (candidate?.type === "message") {
				return candidate;
			}
		}
		return null;
	}, [items]);

	// Play sound when new messages arrive from others (not current user)
	useEffect(() => {
		const currentItems = items;
		const previousItems = previousItemsRef.current;

		// Check if there are new items
		if (currentItems.length > previousItems.length) {
			// Find the new items
			const newItems = currentItems.slice(previousItems.length);

			// Play sound only if new message is from someone else (not current user)
			for (const item of newItems) {
				if (item.type === "message" && item.userId !== currentUserId) {
					playNewMessageSound();
					break; // Only play once per batch
				}
			}
		}

		// Update the ref
		previousItemsRef.current = currentItems as readonly TimelineItem[];
	}, [items, currentUserId, playNewMessageSound]);

	useEffect(() => {
		if (markSeenTimeoutRef.current) {
			clearTimeout(markSeenTimeoutRef.current);
			markSeenTimeoutRef.current = null;
		}

		if (!lastMessage) {
			return;
		}

		if (!selectedConversation || selectedConversation.id !== conversationId) {
			lastMarkedMessageIdRef.current = null;
			return;
		}

		if (!(isPageVisible && hasWindowFocus)) {
			return;
		}

		if (lastMessage.userId === currentUserId) {
			lastMarkedMessageIdRef.current = lastMessage.id || null;
			return;
		}

		const lastMessageCreatedAt = new Date(lastMessage.createdAt);
		const lastSeenAt = selectedConversation.lastSeenAt
			? new Date(selectedConversation.lastSeenAt)
			: null;

		if (lastSeenAt && lastSeenAt >= lastMessageCreatedAt) {
			lastMarkedMessageIdRef.current = lastMessage.id || null;
			return;
		}

		if (lastMarkedMessageIdRef.current === (lastMessage.id || null)) {
			return;
		}

		const pendingMessageId = lastMessage.id || null;

		markSeenTimeoutRef.current = setTimeout(() => {
			const isVisibleNow =
				typeof document !== "undefined" ? !document.hidden : true;
			const hasFocusNow =
				typeof document !== "undefined" &&
				typeof document.hasFocus === "function"
					? document.hasFocus()
					: true;

			if (!(isVisibleNow && hasFocusNow)) {
				markSeenTimeoutRef.current = null;
				return;
			}

			// Check if conversation timeline is scrolled near bottom
			const timelineElement =
				typeof document !== "undefined"
					? document.getElementById("conversation-timeline")
					: null;
			const isNearBottom = timelineElement
				? timelineElement.scrollHeight -
						timelineElement.scrollTop -
						timelineElement.clientHeight <=
					32
				: true; // Default to true if element not found (SSR or unmounted)

			if (!isNearBottom) {
				markSeenTimeoutRef.current = null;
				return;
			}

			markRead()
				.then(() => {
					lastMarkedMessageIdRef.current = pendingMessageId;
				})
				.catch(() => {
					// no-op: we'll retry on next render if needed
				})
				.finally(() => {
					markSeenTimeoutRef.current = null;
				});
		}, CONVERSATION_AUTO_SEEN_DELAY_MS);

		return () => {
			if (markSeenTimeoutRef.current) {
				clearTimeout(markSeenTimeoutRef.current);
				markSeenTimeoutRef.current = null;
			}
		};
	}, [
		conversationId,
		currentUserId,
		hasWindowFocus,
		isPageVisible,
		lastMessage,
		markRead,
		selectedConversation,
	]);

	useHotkeys(
		["escape", "j", "k"],
		(_, handler) => {
			switch (handler.keys?.join("")) {
				case "escape":
					goBack();
					break;
				case "j":
					if (previousConversation) {
						navigateToPreviousConversation();
					}
					break;
				case "k":
					if (nextConversation) {
						navigateToNextConversation();
					}
					break;
				default:
					break;
			}
		},
		{
			preventDefault: true,
			enableOnContentEditable: false,
			enableOnFormTags: false,
		}
	);

	const onFetchMoreIfNeeded = useCallback(async () => {
		if (hasNextPage) {
			await fetchNextPage();
		}
	}, [fetchNextPage, hasNextPage]);

	const activeClarificationSummary =
		selectedConversation?.activeClarification ?? null;
	const hasEscalationAction = Boolean(
		selectedConversation?.escalatedAt &&
			!selectedConversation?.escalationHandledAt
	);
	const clarificationDisplayState =
		resolveConversationClarificationDisplayState({
			summary: activeClarificationSummary,
			request: activeClarificationData?.request,
			engagedRequestId: engagedClarificationRequestId,
			hasEscalation: hasEscalationAction,
			hasLimitAction: isMessageLimitReached,
		});
	const showClarificationAction = clarificationDisplayState.showAction;
	const showClarificationPrompt = clarificationDisplayState.showPrompt;
	const engagedClarificationRequest = clarificationDisplayState.actionRequest;
	const showClarificationReview = clarificationDisplayState.showReview;
	const clarificationReviewRequest = clarificationDisplayState.reviewRequest;

	const handleStartClarification = useCallback(() => {
		if (!activeClarificationSummary) {
			return;
		}

		startTransition(() => {
			setEngagedClarificationRequestId(activeClarificationSummary.requestId);
		});

		if (
			activeClarificationData?.request?.id !==
			activeClarificationSummary.requestId
		) {
			void refetchActiveClarification();
		}
	}, [
		activeClarificationData?.request?.id,
		activeClarificationSummary,
		hasEscalationAction,
		refetchActiveClarification,
	]);
	const handleCancelClarification = useCallback(() => {
		setEngagedClarificationRequestId(null);
	}, []);

	const clarificationPromptContent =
		activeClarificationSummary && showClarificationPrompt ? (
			<ClarificationPrompt
				conversationId={conversationId}
				onClarify={handleStartClarification}
				summary={activeClarificationSummary}
				websiteSlug={websiteSlug}
			/>
		) : null;

	const clarificationComposerBlocks = useClarificationComposerFlow({
		conversationId,
		onCancel: handleCancelClarification,
		request: showClarificationReview
			? clarificationReviewRequest
			: showClarificationAction
				? engagedClarificationRequest
				: null,
		summary:
			showClarificationReview || showClarificationAction
				? activeClarificationSummary
				: null,
		websiteSlug,
	});

	useEffect(() => {
		if (
			clarificationDisplayState.engagedRequestId !==
			engagedClarificationRequestId
		) {
			setEngagedClarificationRequestId(
				clarificationDisplayState.engagedRequestId
			);
		}
	}, [
		clarificationDisplayState.engagedRequestId,
		engagedClarificationRequestId,
	]);

	if (!visitor) {
		return null;
	}

	if (!selectedConversation) {
		return null;
	}

	const navigationProps: ConversationHeaderNavigationProps = {
		onGoBack: goBack,
		onNavigateToPrevious: navigateToPreviousConversation,
		onNavigateToNext: navigateToNextConversation,
		hasPreviousConversation: Boolean(previousConversation),
		hasNextConversation: Boolean(nextConversation),
		selectedConversationIndex,
		totalOpenConversations: conversations.length,
	};
	const composerViewModel = buildConversationComposerViewModel({
		input: {
			allowedFileTypes: FILE_INPUT_ACCEPT,
			error,
			files,
			isSubmitting,
			isUploading,
			uploadProgress,
			maxFileSize: 10 * 1024 * 1024,
			maxFiles: 2,
			onChange: handleMessageChange,
			onMarkdownChange: handleMarkdownChange,
			onFileSelect: addFiles,
			onRemoveFile: removeFile,
			onSubmit: submit,
			placeholder: "Type your message...",
			value: message,
			visibility: messageVisibility,
			onVisibilityChange: setMessageVisibility,
			aiPausedUntil: selectedConversation.aiPausedUntil,
			onAiPauseAction: handleAiPauseAction,
			isAiPauseActionPending: pendingAction.pauseAi || pendingAction.resumeAi,
			priority: selectedConversation.priority,
			onPriorityChange: handlePriorityChange,
			isPriorityActionPending: pendingAction.updatePriority,
			sentiment: selectedConversation.sentiment,
			onSentimentChange: handleSentimentChange,
			isSentimentActionPending: pendingAction.updateSentiment,
			renderAttachButton: ({ triggerFileInput, disabled }) => (
				<TooltipOnHover content="Attach files">
					<ButtonWithPaywall
						className={cn(files.length >= 2 && "opacity-50")}
						disabled={disabled}
						featureKey="dashboard-file-sharing"
						onClick={triggerFileInput}
						size="icon"
						type="button"
						variant="ghost"
						websiteSlug={websiteSlug}
					>
						<Icon className="h-4 w-4" name="attachment" />
					</ButtonWithPaywall>
				</TooltipOnHover>
			),
			mentionConfig: {
				aiAgent: aiAgent
					? {
							id: aiAgent.id,
							name: aiAgent.name,
							isActive: aiAgent.isActive,
							image: aiAgent.image ?? null,
						}
					: null,
				teamMembers: members.map((member) => ({
					...member,
					name: resolveDashboardHumanAgentDisplay(member).displayName,
				})),
				visitor,
			},
		},
		clarificationPrompt: clarificationPromptContent,
		clarificationFlow: clarificationComposerBlocks,
		escalationAction: hasEscalationAction
			? {
					reason:
						selectedConversation.escalationReason ??
						"Human assistance requested",
					onJoin: joinEscalation,
					isJoining: pendingAction.joinEscalation,
				}
			: null,
		limitAction:
			!hasEscalationAction && isMessageLimitReached
				? {
						limit: messageLimitStatus?.limit ?? null,
						onUpgradeClick: () => setIsUpgradeModalOpen(true),
						used: messageLimitStatus?.used ?? 0,
						windowDays: hardLimitStatus?.rollingWindowDays ?? 30,
					}
				: null,
	});

	const conversationProps: ConversationProps = {
		header: {
			isLeftSidebarOpen,
			isRightSidebarOpen,
			onToggleLeftSidebar: toggleLeftSidebar,
			onToggleRightSidebar: toggleRightSidebar,
			navigation: navigationProps,
			conversationId,
			websiteSlug,
			visitorId,
			status: selectedConversation?.status,
			deletedAt: selectedConversation?.deletedAt ?? null,
			visitorIsBlocked: selectedConversation?.visitor.isBlocked ?? null,
			title: selectedConversation?.title ?? null,
			titleSource: selectedConversation?.titleSource ?? null,
			onUpdateTitle: updateTitle,
		},
		timeline: {
			availableAIAgents,
			conversationId,
			conversationVisitorLanguage:
				selectedConversation?.visitorLanguage ?? null,
			currentUserId,
			items: items as TimelineItem[],
			onFetchMoreIfNeeded,
			seenData,
			teamMembers: members,
			visitor,
		},
		input: composerViewModel.input,
		visitorSidebar: {
			conversationId,
			visitorId,
			isLoading: isVisitorLoading,
			visitor,
		},
		limitAction: composerViewModel.limitAction,
	};

	return (
		<>
			{/* {!hardLimitsEnforced &&
			hardLimitsUnavailableReason === "billing_provider_unavailable" ? (
				<div className="mx-4 mb-2 rounded border border-cossistant-orange/30 bg-cossistant-orange/5 px-3 py-2 text-cossistant-orange text-xs">
					Hard-limit checks are temporarily unavailable while billing sync
					recovers.
				</div>
			) : null} */}
			<Conversation {...conversationProps} />
			{planInfo ? (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="messages"
					initialPlanName="pro"
					onOpenChange={setIsUpgradeModalOpen}
					open={isUpgradeModalOpen}
					websiteSlug={websiteSlug}
				/>
			) : null}
		</>
	);
}
