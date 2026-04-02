"use client";

import {
	type RealtimeEventHandlersMap,
	useRealtime,
} from "@plasma/next/realtime";
import { useQueryNormalizer } from "@normy/react-query";
import * as ReactQuery from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { useUserSession, useWebsite } from "@/contexts/website";
import { getOnlineNowQueryKeyPrefix } from "@/data/use-online-now";
import { getPresenceLocationsQueryKeyPrefix } from "@/data/use-presence-locations";
import { getVisitorPresenceQueryKeyPrefix } from "@/data/use-visitor-presence";
import { useTrainingControls } from "@/hooks/use-training-controls";
import { useTRPC } from "@/lib/trpc/client";
import { handleConversationCreated } from "./events/handlers/conversation-created";
import { handleConversationSeen } from "./events/handlers/conversation-seen";
import { handleConversationTyping } from "./events/handlers/conversation-typing";
import { handleConversationUpdated } from "./events/handlers/conversation-updated";
import {
	handleCrawlCompleted,
	handleCrawlFailed,
	handleCrawlPageCompleted,
	handleCrawlPagesDiscovered,
	handleCrawlProgress,
	handleCrawlStarted,
	handleLinkSourceUpdated,
} from "./events/handlers/crawl-progress";
import { handleMessageCreated } from "./events/handlers/timeline-item-created";
import { handleTimelineItemUpdated } from "./events/handlers/timeline-item-updated";
import {
	handleTrainingCompleted,
	handleTrainingFailed,
	handleTrainingProgress,
	handleTrainingStarted,
} from "./events/handlers/training-progress";
import { handleVisitorIdentified } from "./events/handlers/visitor-identified";
import type { DashboardRealtimeContext } from "./events/types";

export function Realtime({ children }: { children: ReactNode }) {
	const queryClient = ReactQuery.useQueryClient();
	const queryNormalizer = useQueryNormalizer();
	const website = useWebsite();
	const { user } = useUserSession();
	const trpc = useTRPC();

	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

	// Fetch data needed for training from toasts
	const { data: agent } = ReactQuery.useQuery(
		trpc.aiAgent.get.queryOptions({ websiteSlug: website.slug })
	);
	const { data: planInfo } = ReactQuery.useQuery(
		trpc.plan.getPlanInfo.queryOptions({ websiteSlug: website.slug })
	);

	const training = useTrainingControls({
		aiAgentId: agent?.id ?? null,
		onBlocked: () => {
			setIsUpgradeModalOpen(true);
		},
		websiteSlug: website.slug,
	});

	const presenceQueryKeyPrefix = useMemo(
		() => getVisitorPresenceQueryKeyPrefix(website.slug),
		[website.slug]
	);
	const onlineNowQueryKeyPrefix = useMemo(
		() => getOnlineNowQueryKeyPrefix(website.slug),
		[website.slug]
	);
	const presenceLocationsQueryKeyPrefix = useMemo(
		() => getPresenceLocationsQueryKeyPrefix(website.slug),
		[website.slug]
	);

	const invalidatePresenceQueries = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: presenceQueryKeyPrefix,
		});
		void queryClient.invalidateQueries({
			queryKey: onlineNowQueryKeyPrefix,
		});
		void queryClient.invalidateQueries({
			queryKey: presenceLocationsQueryKeyPrefix,
		});
	}, [
		onlineNowQueryKeyPrefix,
		presenceLocationsQueryKeyPrefix,
		presenceQueryKeyPrefix,
		queryClient,
	]);

	const realtimeContext = useMemo<DashboardRealtimeContext>(
		() => ({
			queryClient,
			queryNormalizer,
			website: {
				id: website.id,
				slug: website.slug,
			},
			training,
			userId: user?.id ?? null,
		}),
		[queryClient, queryNormalizer, training, website.id, website.slug, user?.id]
	);

	const events = useMemo<RealtimeEventHandlersMap<DashboardRealtimeContext>>(
		() => ({
			conversationCreated: [
				(_data, meta) => {
					handleConversationCreated({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			timelineItemCreated: [
				(_data, meta) => {
					handleMessageCreated({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			timelineItemUpdated: [
				(_data, meta) => {
					handleTimelineItemUpdated({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			conversationSeen: [
				(_data, meta) => {
					void handleConversationSeen({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			conversationTyping: [
				(_data, meta) => {
					handleConversationTyping({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			conversationUpdated: [
				(_data, meta) => {
					handleConversationUpdated({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			visitorIdentified: [
				(_data, meta) => {
					handleVisitorIdentified({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			userConnected: [
				() => {
					invalidatePresenceQueries();
				},
			],
			userDisconnected: [
				() => {
					invalidatePresenceQueries();
				},
			],
			visitorConnected: [
				() => {
					invalidatePresenceQueries();
				},
			],
			visitorDisconnected: [
				() => {
					invalidatePresenceQueries();
				},
			],
			visitorPresenceUpdate: [
				() => {
					invalidatePresenceQueries();
				},
			],
			// Web crawling events
			crawlStarted: [
				(_data, meta) => {
					handleCrawlStarted({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			crawlProgress: [
				(_data, meta) => {
					handleCrawlProgress({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			crawlCompleted: [
				(_data, meta) =>
					handleCrawlCompleted({
						event: meta.event,
						context: meta.context,
					}),
			],
			crawlFailed: [
				(_data, meta) => {
					handleCrawlFailed({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			linkSourceUpdated: [
				(_data, meta) => {
					handleLinkSourceUpdated({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			crawlPagesDiscovered: [
				(_data, meta) => {
					handleCrawlPagesDiscovered({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			crawlPageCompleted: [
				(_data, meta) => {
					handleCrawlPageCompleted({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			// AI training events
			trainingStarted: [
				(_data, meta) => {
					handleTrainingStarted({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			trainingProgress: [
				(_data, meta) => {
					handleTrainingProgress({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			trainingCompleted: [
				(_data, meta) => {
					handleTrainingCompleted({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			trainingFailed: [
				(_data, meta) => {
					handleTrainingFailed({
						event: meta.event,
						context: meta.context,
					});
				},
			],
		}),
		[invalidatePresenceQueries]
	);

	useRealtime<DashboardRealtimeContext>({
		context: realtimeContext,
		websiteId: website.id,
		events,
		onEventError: (error, event) => {
			console.error("[DashboardRealtime] handler failed", {
				error,
				eventType: event.type,
			});
		},
	});

	return (
		<>
			{children}
			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="ai-agent-training-interval"
					initialPlanName="hobby"
					onOpenChange={setIsUpgradeModalOpen}
					open={isUpgradeModalOpen}
					websiteSlug={website.slug}
				/>
			)}
		</>
	);
}
