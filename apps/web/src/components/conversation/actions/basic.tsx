/** biome-ignore-all lint/correctness/useExhaustiveDependencies: ok */
"use client";

import { ConversationStatus } from "@plasma/types";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useConversationActionRunner } from "./use-conversation-action-runner";

export function ConversationBasicActions({
	className,
	conversationId,
	visitorId,
	status,
	deletedAt,
	enableKeyboardShortcuts = false,
	hasUnreadMessage = false,
}: {
	className?: string;
	conversationId: string;
	visitorId?: string | null;
	status?: ConversationStatus;
	deletedAt?: string | null;
	enableKeyboardShortcuts?: boolean;
	hasUnreadMessage?: boolean;
}) {
	const {
		markResolved,
		markOpen,
		markArchived,
		markUnarchived,
		markRead,
		markUnread,
		markNotSpam,
		pendingAction,
		runAction,
	} = useConversationActionRunner({
		conversationId,
		visitorId,
	});

	const isResolved = status === ConversationStatus.RESOLVED;
	const resolveLabel = useMemo(
		() =>
			isResolved
				? "Mark conversation unresolved"
				: "Mark conversation resolved",
		[isResolved]
	);
	const resolveSuccessMessage = useMemo(
		() =>
			isResolved
				? "Conversation marked unresolved"
				: "Conversation marked resolved",
		[isResolved]
	);
	const resolveErrorMessage = "Failed to update resolution status";
	const resolveIcon = isResolved ? "cancel" : "check";

	const isArchived = deletedAt !== null;
	const archiveLabel = useMemo(
		() => (isArchived ? "Unarchive conversation" : "Archive conversation"),
		[isArchived]
	);
	const archiveSuccessMessage = useMemo(
		() => (isArchived ? "Conversation unarchived" : "Conversation archived"),
		[isArchived]
	);
	const archiveErrorMessage = "Failed to update archive status";
	const archiveIcon = isArchived ? "cancel" : "archive";

	const resolvePending = isResolved
		? pendingAction.markOpen
		: pendingAction.markResolved;

	const archivePending = isArchived
		? pendingAction.markUnarchived
		: pendingAction.markArchived;

	// Read/Unread logic
	const readUnreadLabel = useMemo(
		() =>
			hasUnreadMessage
				? "Mark conversation as read"
				: "Mark conversation as unread",
		[hasUnreadMessage]
	);
	const readUnreadSuccessMessage = useMemo(
		() =>
			hasUnreadMessage
				? "Conversation marked as read"
				: "Conversation marked as unread",
		[hasUnreadMessage]
	);
	const readUnreadErrorMessage = hasUnreadMessage
		? "Failed to mark as read"
		: "Failed to mark as unread";
	const readUnreadIcon = hasUnreadMessage ? "eye" : "eye-off";

	const readUnreadPending = hasUnreadMessage
		? pendingAction.markRead
		: pendingAction.markUnread;

	// Spam logic
	const isSpam = status === ConversationStatus.SPAM;
	const notSpamLabel = "Move to inbox";
	const notSpamSuccessMessage = "Conversation moved to inbox";
	const notSpamErrorMessage = "Failed to move to inbox";

	const runResolveAction = useCallback(() => {
		if (resolvePending || isArchived) {
			return;
		}
		void runAction(() => (isResolved ? markOpen() : markResolved()), {
			successMessage: resolveSuccessMessage,
			errorMessage: resolveErrorMessage,
		});
	}, [
		isArchived,
		isResolved,
		markOpen,
		markResolved,
		resolveErrorMessage,
		resolvePending,
		resolveSuccessMessage,
		runAction,
	]);

	const handleResolve = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			runResolveAction();
		},
		[runResolveAction]
	);

	const runArchiveAction = useCallback(() => {
		if (archivePending) {
			return;
		}
		void runAction(() => (isArchived ? markUnarchived() : markArchived()), {
			successMessage: archiveSuccessMessage,
			errorMessage: archiveErrorMessage,
		});
	}, [
		archiveErrorMessage,
		archivePending,
		archiveSuccessMessage,
		isArchived,
		markArchived,
		markUnarchived,
		runAction,
	]);

	const handleArchive = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			runArchiveAction();
		},
		[runArchiveAction]
	);

	const runReadUnreadAction = useCallback(() => {
		if (readUnreadPending) {
			return;
		}
		void runAction(() => (hasUnreadMessage ? markRead() : markUnread()), {
			successMessage: readUnreadSuccessMessage,
			errorMessage: readUnreadErrorMessage,
		});
	}, [
		hasUnreadMessage,
		markRead,
		markUnread,
		readUnreadErrorMessage,
		readUnreadPending,
		readUnreadSuccessMessage,
		runAction,
	]);

	const handleReadUnread = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			runReadUnreadAction();
		},
		[runReadUnreadAction]
	);

	const runNotSpamAction = useCallback(() => {
		if (pendingAction.markNotSpam) {
			return;
		}
		void runAction(() => markNotSpam(), {
			successMessage: notSpamSuccessMessage,
			errorMessage: notSpamErrorMessage,
		});
	}, [
		markNotSpam,
		notSpamErrorMessage,
		notSpamSuccessMessage,
		pendingAction.markNotSpam,
		runAction,
	]);

	const handleNotSpam = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			runNotSpamAction();
		},
		[runNotSpamAction]
	);

	const resolveShortcutsEnabled =
		enableKeyboardShortcuts && !isArchived && !isSpam;
	const archiveShortcutsEnabled = enableKeyboardShortcuts;

	useHotkeys(
		"r",
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			runResolveAction();
		},
		{
			enabled: resolveShortcutsEnabled,
			enableOnFormTags: false,
			enableOnContentEditable: false,
		},
		[resolveShortcutsEnabled, runResolveAction]
	);

	useHotkeys(
		"x",
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			runArchiveAction();
		},
		{
			enabled: archiveShortcutsEnabled,
			enableOnFormTags: false,
			enableOnContentEditable: false,
		},
		[archiveShortcutsEnabled, runArchiveAction]
	);

	const readUnreadShortcutsEnabled = enableKeyboardShortcuts && !isSpam;

	useHotkeys(
		"u",
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			runReadUnreadAction();
		},
		{
			enabled: readUnreadShortcutsEnabled,
			enableOnFormTags: false,
			enableOnContentEditable: false,
		},
		[readUnreadShortcutsEnabled, runReadUnreadAction]
	);

	// For spam conversations, show "Move to inbox" and "Archive"
	if (isSpam) {
		return (
			<div className={cn("flex items-center gap-2 pr-1", className)}>
				<TooltipOnHover content={notSpamLabel}>
					<Button
						aria-label={notSpamLabel}
						disabled={pendingAction.markNotSpam}
						onClick={handleNotSpam}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<Icon filledOnHover name="inbox-zero" />
					</Button>
				</TooltipOnHover>
				<TooltipOnHover content={archiveLabel} shortcuts={["X"]}>
					<Button
						aria-label={archiveLabel}
						disabled={archivePending}
						onClick={handleArchive}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<Icon filledOnHover name={archiveIcon} />
					</Button>
				</TooltipOnHover>
			</div>
		);
	}

	return (
		<div className={cn("flex items-center gap-2 pr-1", className)}>
			{!isArchived && (
				<TooltipOnHover content={resolveLabel} shortcuts={["R"]}>
					<Button
						aria-label={resolveLabel}
						disabled={resolvePending}
						onClick={handleResolve}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<Icon filledOnHover name={resolveIcon} />
					</Button>
				</TooltipOnHover>
			)}
			<TooltipOnHover content={readUnreadLabel} shortcuts={["U"]}>
				<Button
					aria-label={readUnreadLabel}
					disabled={readUnreadPending}
					onClick={handleReadUnread}
					size="icon-small"
					type="button"
					variant="ghost"
				>
					<Icon filledOnHover name={readUnreadIcon} />
				</Button>
			</TooltipOnHover>
			<TooltipOnHover content={archiveLabel} shortcuts={["X"]}>
				<Button
					aria-label={archiveLabel}
					disabled={archivePending}
					onClick={handleArchive}
					size="icon-small"
					type="button"
					variant="ghost"
				>
					<Icon filledOnHover name={archiveIcon} />
				</Button>
			</TooltipOnHover>
		</div>
	);
}
