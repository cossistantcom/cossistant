import type { ConversationHeader as ConversationHeaderType } from "@plasma/types";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import {
	Composer,
	type MessageVisibility,
} from "@/components/conversation/composer";
import { FakeComposerTextareaDisplay } from "@/components/landing/fake-dashboard/fake-composer-textarea-display";
import { Page } from "@/components/ui/layout";
import type { ConversationHeader } from "@/contexts/inboxes";
import type { ConversationTimelineItem } from "@/data/conversation-message-cache";
import type { FakeTypingActor, FakeVisitor } from "../data";
import { FakeMouseCursor } from "../fake-inbox/fake-mouse-cursor";
import { FakeInboxNavigationSidebar } from "../fake-sidebar/inbox";
import { FakeVisitorSidebar } from "../fake-sidebar/visitor";
import { FakeConversationHeader } from "./fake-conversation-header";
import { FakeConversationTimelineList } from "./fake-conversation-timeline-list";

type Props = {
	typingActors: FakeTypingActor[];
	conversation: ConversationHeaderType;
	timeline: ConversationTimelineItem[];
	visitor: FakeVisitor;
	isEscalationPending: boolean;
	composerValue?: string;
	composerVisibility?: MessageVisibility;
	isComposerTyping?: boolean;
	onJoinConversation: () => void;
	onComposerVisibilityChange?: (visibility: MessageVisibility) => void;
	showJoinCursor?: boolean;
	onJoinCursorClick?: () => void;
	showLeftSidebar?: boolean;
	leftSidebarOpen?: boolean;
	showVisitorSidebar?: boolean;
	showHeader?: boolean;
	timelineClassName?: string;
	bottomSlot?: ReactNode;
	overlaySlot?: ReactNode;
};

function getComposerPlaceholder(visibility: MessageVisibility) {
	return visibility === "private"
		? "Write a private note..."
		: "Type your message...";
}

export function FakeConversation({
	typingActors,
	conversation,
	timeline,
	visitor,
	isEscalationPending,
	composerValue = "",
	composerVisibility = "public",
	isComposerTyping = false,
	onJoinConversation,
	onComposerVisibilityChange,
	showJoinCursor = false,
	onJoinCursorClick,
	showLeftSidebar = true,
	leftSidebarOpen = true,
	showVisitorSidebar = true,
	showHeader = true,
	timelineClassName,
	bottomSlot,
	overlaySlot,
}: Props) {
	const timelineVisitor = visitor as unknown as ConversationHeader["visitor"];
	const joinButtonRef = useRef<HTMLButtonElement>(null);
	const cursorContainerRef = useRef<HTMLDivElement>(null);
	const [inputHeight, setInputHeight] = useState(140);
	const composerPlaceholder = getComposerPlaceholder(composerVisibility);
	const textareaOverlay = isEscalationPending ? undefined : (
		<FakeComposerTextareaDisplay
			isTyping={isComposerTyping}
			placeholder={composerPlaceholder}
			value={composerValue}
		/>
	);
	const resolvedBottomSlot =
		bottomSlot !== undefined ? (
			bottomSlot
		) : (
			<Composer
				aiPausedUntil={conversation.aiPausedUntil}
				escalationAction={
					isEscalationPending
						? {
								isJoining: false,
								joinButtonRef,
								onJoin: onJoinConversation,
								reason:
									conversation.escalationReason ??
									"Human assistance requested by AI",
							}
						: null
				}
				layoutMode="docked"
				onAiPauseAction={() => {}}
				onChange={() => {}}
				onHeightChange={setInputHeight}
				onSubmit={() => {}}
				onVisibilityChange={onComposerVisibilityChange}
				placeholder={composerPlaceholder}
				textareaOverlay={textareaOverlay}
				value={composerValue}
				visibility={composerVisibility}
			/>
		);

	return (
		<>
			{showLeftSidebar ? (
				<FakeInboxNavigationSidebar
					activeView="inbox"
					open={leftSidebarOpen}
					statusCounts={{ open: 10, resolved: 0, spam: 0, archived: 0 }}
				/>
			) : null}
			<div className="relative flex h-full flex-1" ref={cursorContainerRef}>
				<Page className="py-0 pr-0.5 pl-0">
					{showHeader ? (
						<FakeConversationHeader isLeftSidebarOpen={leftSidebarOpen} />
					) : null}
					<FakeConversationTimelineList
						className={timelineClassName}
						inputHeight={inputHeight}
						items={timeline}
						typingActors={typingActors}
						visitor={timelineVisitor}
					/>
					{resolvedBottomSlot}
					{overlaySlot}
				</Page>
				{isEscalationPending && showJoinCursor ? (
					<FakeMouseCursor
						containerRef={cursorContainerRef}
						isVisible={showJoinCursor}
						onClick={onJoinCursorClick ?? onJoinConversation}
						targetElementRef={
							joinButtonRef as unknown as RefObject<HTMLElement | null>
						}
						targetMode="element"
					/>
				) : null}
			</div>
			{showVisitorSidebar ? (
				<FakeVisitorSidebar open={true} visitor={visitor} />
			) : null}
		</>
	);
}
