"use client";

import type {
	ConversationHeader,
	InboxAnalyticsResponse,
} from "@plasma/types";
import { useMemo, useRef, useState } from "react";
import {
	InboxAnalyticsDisplay,
	type InboxAnalyticsLivePresence,
	InboxAnalyticsRangeControl,
	type InboxAnalyticsRangeDays,
} from "@/components/inbox-analytics";
import { Page, PageHeader, PageHeaderTitle } from "@/components/ui/layout";
import { FakeInboxNavigationSidebar } from "../fake-sidebar/inbox";
import { FakeConversationList } from "./fake-conversation-list";
import { FakeMouseCursor } from "./fake-mouse-cursor";

const DEMO_LIVE_PRESENCE: InboxAnalyticsLivePresence = {
	count: 12,
	isFetching: true,
	isLoading: false,
};

type Props = {
	conversations: ConversationHeader[];
	showMouseCursor?: boolean;
	onMouseClick?: () => void;
};

export function FakeInbox({
	conversations,
	showMouseCursor = false,
	onMouseClick,
}: Props) {
	const marcConversationRef = useRef<HTMLDivElement>(null);
	const cursorContainerRef = useRef<HTMLDivElement>(null);
	const [rangeDays, setRangeDays] = useState<InboxAnalyticsRangeDays>(7);

	const statusCounts = useMemo(
		() =>
			conversations.reduce(
				(acc, conversation) => {
					if (conversation.deletedAt) {
						acc.archived += 1;
						return acc;
					}

					if (conversation.status === "resolved" || conversation.resolvedAt) {
						acc.resolved += 1;
						return acc;
					}

					if (conversation.status === "spam") {
						acc.spam += 1;
						return acc;
					}

					acc.open += 1;
					return acc;
				},
				{ open: 0, resolved: 0, spam: 0, archived: 0 }
			),
		[conversations]
	);

	const analyticsData = useMemo<InboxAnalyticsResponse>(
		() => ({
			range: {
				rangeDays,
				currentStart: new Date().toISOString(),
				currentEnd: new Date().toISOString(),
				previousStart: new Date().toISOString(),
				previousEnd: new Date().toISOString(),
			},
			current: {
				medianResponseTimeSeconds: 320,
				medianResolutionTimeSeconds: 5400,
				aiHandledRate: 62,
				satisfactionIndex: 86,
				uniqueVisitors: 1280,
			},
			previous: {
				medianResponseTimeSeconds: 410,
				medianResolutionTimeSeconds: 6100,
				aiHandledRate: 55,
				satisfactionIndex: 82,
				uniqueVisitors: 1130,
			},
		}),
		[rangeDays]
	);

	return (
		<>
			<FakeInboxNavigationSidebar
				activeView="inbox"
				open
				statusCounts={statusCounts}
			/>
			<div className="relative flex h-full flex-1" ref={cursorContainerRef}>
				<Page className="relative px-0">
					<PageHeader className="px-4">
						<div className="flex items-center gap-2">
							<PageHeaderTitle className="capitalize">Inbox</PageHeaderTitle>
						</div>
						<div
							className="flex items-center justify-end gap-2"
							data-slot="fake-inbox-header-controls"
						>
							<InboxAnalyticsRangeControl
								onRangeChange={setRangeDays}
								rangeDays={rangeDays}
								size="sm"
							/>
						</div>
					</PageHeader>

					<FakeConversationList
						analyticsSlot={
							<InboxAnalyticsDisplay
								controlSize="sm"
								data={analyticsData}
								livePresence={DEMO_LIVE_PRESENCE}
								onRangeChange={setRangeDays}
								rangeDays={rangeDays}
								showControl={false}
							/>
						}
						conversations={conversations}
						marcConversationRef={marcConversationRef}
					/>
				</Page>
				{showMouseCursor && onMouseClick && (
					<FakeMouseCursor
						containerRef={cursorContainerRef}
						isVisible={showMouseCursor}
						onClick={onMouseClick}
						targetElementRef={marcConversationRef}
					/>
				)}
			</div>
		</>
	);
}
