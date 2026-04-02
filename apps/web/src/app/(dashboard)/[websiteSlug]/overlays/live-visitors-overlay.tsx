"use client";

import type { InboxAnalyticsResponse } from "@plasma/types";
import { useMemo } from "react";
import { Globe, type GlobeVisitor } from "@/components/globe";
import {
	InboxAnalyticsDesktopHeaderActions,
	InboxAnalyticsDisplay,
	type InboxAnalyticsLivePresence,
	type InboxAnalyticsRangeDays,
	useInboxAnalyticsController,
} from "@/components/inbox-analytics";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/layout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useWebsite } from "@/contexts/website";
import {
	isVisitorOnlineEntity,
	type OnlineEntity,
	useOnlineNow,
} from "@/data/use-online-now";
import { useContactVisitorDetailState } from "@/hooks/use-contact-visitor-detail-state";
import { useLiveVisitorsOverlayState } from "@/hooks/use-live-visitors-overlay-state";
import { formatLastSeenAt } from "@/lib/date";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import {
	DashboardOverlayCenteredState,
	DashboardOverlayShell,
} from "./dashboard-overlay-shell";

type LiveVisitorEntry = {
	avatarUrl: string | null;
	attributionChannel: string | null;
	city: string | null;
	countryCode: string | null;
	id: string;
	lastSeen: string;
	latitude: number | null;
	longitude: number | null;
	name: string;
	pagePath: string | null;
};

const LIVE_VISITORS_GLOBE_ROTATION_SPEED = 4;

type LiveVisitorsOverlayViewProps = {
	analyticsData: InboxAnalyticsResponse | null;
	analyticsIsError: boolean;
	analyticsIsLoading: boolean;
	onClose: () => void;
	isLiveError: boolean;
	isLiveLoading: boolean;
	livePresence: InboxAnalyticsLivePresence;
	liveVisitors: readonly LiveVisitorEntry[];
	onRangeChange: (rangeDays: InboxAnalyticsRangeDays) => void;
	onVisitorSelect: (visitorId: string) => void;
	rangeDays: InboxAnalyticsRangeDays;
};

function getNonEmptyString(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function formatLiveChannelLabel(channel: string | null | undefined) {
	const normalized = getNonEmptyString(channel);

	if (!normalized) {
		return null;
	}

	return normalized
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLiveLocationLabel(visitor: LiveVisitorEntry) {
	return [visitor.city, visitor.countryCode].filter(Boolean).join(", ") || null;
}

function formatLiveLastSeenLabel(timestamp: string) {
	const parsed = new Date(timestamp);

	if (Number.isNaN(parsed.getTime())) {
		return "Active recently";
	}

	return formatLastSeenAt(parsed);
}

function mapOnlineEntityToLiveVisitor(entity: OnlineEntity): LiveVisitorEntry {
	const providedName = getNonEmptyString(entity.name);
	const name = getVisitorNameWithFallback({
		contact: providedName
			? {
					name: providedName,
				}
			: null,
		id: entity.entity_id,
	});

	return {
		avatarUrl: getNonEmptyString(entity.image),
		attributionChannel: getNonEmptyString(entity.attribution_channel),
		city: getNonEmptyString(entity.city),
		countryCode: getNonEmptyString(entity.country_code),
		id: entity.entity_id,
		lastSeen: entity.last_seen,
		latitude: entity.latitude,
		longitude: entity.longitude,
		name,
		pagePath: getNonEmptyString(entity.page_path),
	};
}

function sortLiveVisitorsByLastSeen(
	left: LiveVisitorEntry,
	right: LiveVisitorEntry
) {
	const leftTime = Date.parse(left.lastSeen);
	const rightTime = Date.parse(right.lastSeen);

	if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
		return left.name.localeCompare(right.name);
	}

	if (Number.isNaN(leftTime)) {
		return 1;
	}

	if (Number.isNaN(rightTime)) {
		return -1;
	}

	return rightTime - leftTime;
}

function hasCoordinates(
	visitor: LiveVisitorEntry
): visitor is LiveVisitorEntry & {
	latitude: number;
	longitude: number;
} {
	return visitor.latitude != null && visitor.longitude != null;
}

function buildGlobeVisitors(
	liveVisitors: readonly LiveVisitorEntry[]
): readonly GlobeVisitor[] {
	return liveVisitors.filter(hasCoordinates).map((visitor) => ({
		avatarUrl: visitor.avatarUrl,
		facehashSeed: visitor.name,
		id: visitor.id,
		latitude: visitor.latitude,
		locationLabel: formatLiveLocationLabel(visitor),
		longitude: visitor.longitude,
		name: visitor.name,
		pageLabel: visitor.pagePath ?? "Unknown page",
		status: "online",
	}));
}

function LiveVisitorsList({
	liveVisitors,
	onVisitorSelect,
}: {
	liveVisitors: readonly LiveVisitorEntry[];
	onVisitorSelect: (visitorId: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2" data-slot="live-visitors-list">
			{liveVisitors.map((visitor) => {
				const meta = [
					formatLiveLocationLabel(visitor),
					formatLiveChannelLabel(visitor.attributionChannel),
				].filter(Boolean);

				return (
					<Button
						className="group/conversation-item relative h-auto w-full min-w-0 justify-start gap-3 rounded px-2 py-2 text-left text-sm"
						key={visitor.id}
						onClick={() => {
							onVisitorSelect(visitor.id);
						}}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<div className="flex min-w-0 flex-1 items-center gap-3">
							<Avatar
								className="size-8 max-h-8 max-w-8"
								fallbackName={visitor.name}
								lastOnlineAt={visitor.lastSeen}
								status="online"
								tooltipContent={null}
								url={visitor.avatarUrl}
							/>
							<div className="flex min-w-0 flex-1 items-center justify-between gap-3">
								<div className="min-w-0 flex-1">
									<p className="truncate capitalize">{visitor.name}</p>
									<p className="mt-1 truncate text-primary/70 text-sm">
										{visitor.pagePath ?? "Unknown page"}
									</p>
								</div>
							</div>
						</div>
					</Button>
				);
			})}
		</div>
	);
}

export function LiveVisitorsOverlayView({
	analyticsData,
	analyticsIsError,
	analyticsIsLoading,
	onClose,
	isLiveError,
	isLiveLoading,
	livePresence,
	liveVisitors,
	onRangeChange,
	onVisitorSelect,
	rangeDays,
}: LiveVisitorsOverlayViewProps) {
	const globeVisitors = useMemo(
		() => buildGlobeVisitors(liveVisitors),
		[liveVisitors]
	);

	return (
		<DashboardOverlayShell
			className="bg-background dark:bg-background"
			dataSlot="live-visitors-overlay"
			zIndexClassName="z-[15]"
		>
			<div className="h-full w-full px-2 pt-1 pb-2">
				<section className="relative flex h-full max-h-full overflow-clip rounded border border-transparent bg-background dark:bg-background-50">
					<Page className="border-transparent bg-background px-0 dark:border-transparent dark:bg-background">
						<PageHeader className="hidden items-center justify-between bg-transparent pr-3 pl-5 lg:flex dark:bg-transparent">
							<div aria-hidden="true" />
							<InboxAnalyticsDesktopHeaderActions
								actionIconName="x"
								actionLabel="Close live visitors overlay"
								actionTooltip="Close live visitors overlay"
								onActionClick={onClose}
								onRangeChange={onRangeChange}
								rangeDays={rangeDays}
							/>
						</PageHeader>

						<div className="flex min-h-0 flex-1 flex-col p-4 pt-4 lg:pt-14">
							<div className="lg:hidden">
								<InboxAnalyticsDisplay
									className="flex-col items-stretch gap-4"
									controlSize="default"
									data={analyticsData}
									isError={analyticsIsError}
									isLoading={analyticsIsLoading}
									livePresence={livePresence}
									onRangeChange={onRangeChange}
									rangeDays={rangeDays}
								/>
							</div>

							<div
								className="hidden px-1 pt-2 lg:block"
								data-slot="live-visitors-desktop-analytics-slot"
							>
								<InboxAnalyticsDisplay
									controlSize="sm"
									data={analyticsData}
									isError={analyticsIsError}
									isLoading={analyticsIsLoading}
									livePresence={livePresence}
									onRangeChange={onRangeChange}
									rangeDays={rangeDays}
									showControl={false}
								/>
							</div>

							{isLiveLoading && liveVisitors.length === 0 ? (
								<DashboardOverlayCenteredState
									className="flex-1"
									data-slot="live-visitors-loading-state"
								>
									<div className="flex items-center gap-3 text-primary/60 text-sm">
										<Spinner className="h-5 w-5" />
										<span>Loading live visitors...</span>
									</div>
								</DashboardOverlayCenteredState>
							) : isLiveError ? (
								<div className="flex-1 px-4 py-6 lg:px-6 lg:py-8">
									<Alert variant="destructive">
										<AlertTitle>Unable to load live visitors</AlertTitle>
										<AlertDescription>
											An unexpected error occurred while loading connected
											visitors.
										</AlertDescription>
									</Alert>
								</div>
							) : liveVisitors.length === 0 ? (
								<DashboardOverlayCenteredState
									className="flex-1 px-6 text-center text-primary/60 text-sm"
									data-slot="live-visitors-empty-state"
								>
									No live connected visitors right now.
								</DashboardOverlayCenteredState>
							) : (
								<div
									className="flex min-h-0 flex-1 flex-col gap-4 pt-4 lg:flex-row lg:gap-6"
									data-slot="live-visitors-overlay-layout"
								>
									<div className="order-2 min-h-0 lg:order-1 lg:w-[360px] xl:w-[400px]">
										<ScrollArea
											className="h-full lg:px-0"
											maskHeight="120px"
											scrollMask
										>
											<LiveVisitorsList
												liveVisitors={liveVisitors}
												onVisitorSelect={onVisitorSelect}
											/>
										</ScrollArea>
									</div>

									<div
										className="order-1 min-h-[380px] flex-1 overflow-hidden rounded-[10px] bg-background lg:order-2 lg:min-h-0"
										data-slot="live-visitors-globe-panel"
									>
										<Globe
											className="size-full"
											minHeight="100%"
											rotationSpeed={LIVE_VISITORS_GLOBE_ROTATION_SPEED}
											visitors={globeVisitors}
										/>
									</div>
								</div>
							)}
						</div>
					</Page>
				</section>
			</div>
		</DashboardOverlayShell>
	);
}

export function LiveVisitorsOverlay() {
	const website = useWebsite();
	const { closeLiveVisitorsOverlay, isOpen } = useLiveVisitorsOverlayState();
	const analytics = useInboxAnalyticsController({
		enabled: isOpen,
		websiteSlug: website.slug,
	});
	const liveVisitorsQuery = useOnlineNow({
		enabled: isOpen,
		websiteSlug: website.slug,
	});
	const { openVisitorDetail } = useContactVisitorDetailState();

	const liveVisitors = useMemo(
		() =>
			(liveVisitorsQuery.data ?? [])
				.filter((entity) => isVisitorOnlineEntity(entity))
				.map((entity) => mapOnlineEntityToLiveVisitor(entity))
				.sort(sortLiveVisitorsByLastSeen),
		[liveVisitorsQuery.data]
	);

	const livePresence = useMemo<InboxAnalyticsLivePresence>(
		() => ({
			count:
				liveVisitorsQuery.isLoading && liveVisitors.length === 0
					? null
					: liveVisitors.length,
			isFetching: liveVisitorsQuery.isFetching,
			isLoading: liveVisitorsQuery.isLoading,
		}),
		[
			liveVisitors.length,
			liveVisitorsQuery.isFetching,
			liveVisitorsQuery.isLoading,
		]
	);

	if (!isOpen) {
		return null;
	}

	return (
		<LiveVisitorsOverlayView
			analyticsData={analytics.data}
			analyticsIsError={analytics.isError}
			analyticsIsLoading={analytics.isLoading}
			isLiveError={liveVisitorsQuery.isError}
			isLiveLoading={liveVisitorsQuery.isLoading}
			livePresence={livePresence}
			liveVisitors={liveVisitors}
			onClose={() => {
				void closeLiveVisitorsOverlay();
			}}
			onRangeChange={analytics.setRangeDays}
			onVisitorSelect={(visitorId) => {
				void openVisitorDetail(visitorId);
			}}
			rangeDays={analytics.rangeDays}
		/>
	);
}
