import { type Conversation, ConversationStatus } from "@plasma/types";
import type React from "react";
import {
	type ConversationPreviewLastMessage,
	useConversationPreview,
} from "../../hooks/use-conversation-preview";
import { type SupportTextKey, useSupportText } from "../text";
import type { SupportTextResolvedFormatter } from "../text/locales/keys";
import { cn } from "../utils";
import { Avatar } from "./avatar";
import { coButtonVariants } from "./button";
import Icon from "./icons";
import { BouncingDots } from "./typing-indicator";

export type ConversationButtonLinkProps = {
	conversation: Conversation;
	onClick?: () => void;
	className?: string;
};

const STATUS_BADGE_CLASSNAMES: Record<ConversationStatus, string> = {
	[ConversationStatus.OPEN]: "bg-co-success/20 text-co-success-foreground",
	[ConversationStatus.RESOLVED]: "bg-co-neutral/20 text-co-neutral-foreground",
	[ConversationStatus.SPAM]: "bg-co-warning/20 text-co-warning-foreground",
};

const DEFAULT_STATUS_BADGE_CLASSNAME =
	"bg-co-neutral/20 text-co-neutral-foreground";

const STATUS_TEXT_KEYS: Record<ConversationStatus, SupportTextKey> = {
	[ConversationStatus.OPEN]: "component.conversationButtonLink.status.open",
	[ConversationStatus.RESOLVED]:
		"component.conversationButtonLink.status.resolved",
	[ConversationStatus.SPAM]: "component.conversationButtonLink.status.spam",
};

type ConversationButtonPreviewSelection = {
	showTitle: boolean;
	subtitle: string | null;
	showTyping: boolean;
};

type ConversationButtonPreviewMessage = Pick<
	ConversationPreviewLastMessage,
	"content" | "time" | "isFromVisitor" | "senderName"
>;

function normalizePreviewText(value: string | null | undefined): string {
	return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function resolveConversationButtonPreviewSelection({
	title,
	lastMessage,
	isTyping,
	text,
}: {
	title: string;
	lastMessage: ConversationButtonPreviewMessage | null;
	isTyping: boolean;
	text: SupportTextResolvedFormatter;
}): ConversationButtonPreviewSelection {
	if (isTyping) {
		return {
			showTitle: false,
			subtitle: null,
			showTyping: true,
		};
	}

	if (!lastMessage) {
		return {
			showTitle: true,
			subtitle: null,
			showTyping: false,
		};
	}

	const normalizedMessage = normalizePreviewText(lastMessage.content);

	if (!normalizedMessage) {
		return {
			showTitle: true,
			subtitle: null,
			showTyping: false,
		};
	}

	if (normalizePreviewText(title) !== normalizedMessage) {
		return {
			showTitle: true,
			subtitle: lastMessage.content,
			showTyping: false,
		};
	}

	if (lastMessage.isFromVisitor) {
		return {
			showTitle: true,
			subtitle: text("component.conversationButtonLink.lastMessage.visitor", {
				time: lastMessage.time,
			}),
			showTyping: false,
		};
	}

	return {
		showTitle: true,
		subtitle: text("component.conversationButtonLink.lastMessage.agent", {
			name: lastMessage.senderName ?? text("common.fallbacks.unknown"),
			time: lastMessage.time,
		}),
		showTyping: false,
	};
}

/**
 * Renders a navigable preview card for a conversation including assigned agent
 * details, last message snippets and typing indicators.
 */
export function ConversationButtonLink({
	conversation,
	onClick,
	className,
}: ConversationButtonLinkProps): React.ReactElement | null {
	const preview = useConversationPreview({ conversation });
	const text = useSupportText();
	const { lastMessage, assignedAgent, typing } = preview;

	const statusBadgeClassName = conversation.deletedAt
		? STATUS_BADGE_CLASSNAMES[ConversationStatus.RESOLVED]
		: (STATUS_BADGE_CLASSNAMES[conversation.status] ??
			DEFAULT_STATUS_BADGE_CLASSNAME);

	const statusTextKey = conversation.deletedAt
		? STATUS_TEXT_KEYS[ConversationStatus.RESOLVED]
		: STATUS_TEXT_KEYS[conversation.status];

	const statusText = conversation.deletedAt
		? text("component.conversationButtonLink.status.closed")
		: statusTextKey
			? text(statusTextKey)
			: text("common.fallbacks.unknown");

	const displayTitle = preview.title;
	const previewSelection = resolveConversationButtonPreviewSelection({
		title: displayTitle,
		lastMessage,
		isTyping: typing.isTyping,
		text,
	});

	return (
		<button
			className={cn(
				coButtonVariants({
					variant: "secondary",
					size: "large",
				}),
				"group/btn relative gap-2 border-0 border-co-border/50 border-b pr-3 pl-3 text-left transition-colors first-of-type:rounded-t last-of-type:rounded-b last-of-type:border-b-0 has-[>svg]:pl-3",
				className
			)}
			onClick={onClick}
			type="button"
		>
			<Avatar
				className="size-8 flex-shrink-0"
				facehashSeed={assignedAgent.facehashSeed}
				image={assignedAgent?.image}
				isAI={assignedAgent?.type === "ai"}
				lastSeenAt={assignedAgent?.lastSeenAt}
				name={assignedAgent?.name ?? text("common.fallbacks.supportTeam")}
				showBackground
			/>

			<div className="mr-6 ml-1 flex min-w-0 flex-1 flex-col gap-0.5">
				{previewSelection.showTitle ? (
					<div className="flex max-w-[90%] items-center justify-between gap-2">
						<h3 className="truncate font-medium text-co-primary text-sm">
							{displayTitle}
						</h3>
					</div>
				) : null}
				{previewSelection.showTyping ? (
					<BouncingDots />
				) : previewSelection.subtitle ? (
					<p className="truncate text-co-primary/60 text-sm">
						{previewSelection.subtitle}
					</p>
				) : null}
			</div>

			{/* <div
        className={cn(
          "mr-6 inline-flex items-center rounded px-2 py-0.5 font-medium text-[9px] uppercase",
          statusBadgeClassName,
        )}
      >
        {statusText}
      </div> */}

			<Icon
				className="-translate-y-1/2 absolute top-1/2 right-4 size-3 text-co-primary/60 transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:text-co-primary"
				name="arrow-right"
				variant="default"
			/>
		</button>
	);
}
