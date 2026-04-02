import { ConversationStatus } from "@plasma/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@/components/ui/icons";
import { TooltipOnHover } from "@/components/ui/tooltip";
import {
	CONVERSATION_DEVELOPER_MODE_HOTKEY,
	CONVERSATION_DEVELOPER_MODE_SHORTCUT_CHIPS,
	useConversationDeveloperMode,
} from "@/hooks/use-conversation-developer-mode";
import { cn } from "@/lib/utils";
import {
	type RunConversationActionOptions,
	useConversationActionRunner,
} from "./use-conversation-action-runner";

export function MoreConversationActions({
	className,
	conversationId,
	visitorId,
	status,
	visitorIsBlocked,
	deletedAt,
}: {
	className?: string;
	conversationId: string;
	visitorId?: string | null;
	status?: ConversationStatus;
	visitorIsBlocked?: boolean | null;
	deletedAt?: string | null;
}) {
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const [open, setOpen] = useState(false);
	const [tooltipSuppressed, setTooltipSuppressed] = useState(false);
	const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isDeveloperModeEnabled = useConversationDeveloperMode(
		(state) => state.isDeveloperModeEnabled
	);
	const toggleDeveloperMode = useConversationDeveloperMode(
		(state) => state.toggleDeveloperMode
	);

	const {
		markResolved,
		markOpen,
		markArchived,
		markUnarchived,
		markSpam,
		markNotSpam,
		blockVisitor,
		unblockVisitor,
		pendingAction,
		runAction,
	} = useConversationActionRunner({ conversationId, visitorId });

	const isResolved = status === ConversationStatus.RESOLVED;
	const isSpam = status === ConversationStatus.SPAM;
	const isArchived = deletedAt !== null;
	const isBlocked = Boolean(visitorIsBlocked);
	const canToggleBlock = Boolean(visitorId);

	const resolveLabel = isResolved ? "Mark unresolved" : "Mark resolved";
	const spamLabel = isSpam ? "Mark not spam" : "Mark spam";
	const archiveLabel = isArchived ? "Unarchive" : "Archive";
	const blockLabel = isBlocked ? "Unblock visitor" : "Block visitor";

	const resolvePending = isResolved
		? pendingAction.markOpen
		: pendingAction.markResolved;
	const spamPending = isSpam
		? pendingAction.markNotSpam
		: pendingAction.markSpam;
	const archivePending = isArchived
		? pendingAction.markUnarchived
		: pendingAction.markArchived;
	const blockPending = isBlocked
		? pendingAction.unblockVisitor
		: pendingAction.blockVisitor;

	const resolveSuccessMessage = isResolved
		? "Conversation marked unresolved"
		: "Conversation marked resolved";
	const resolveErrorMessage = "Failed to update resolution status";
	const archiveSuccessMessage = isArchived
		? "Conversation unarchived"
		: "Conversation archived";
	const archiveErrorMessage = "Failed to update archive status";
	const spamSuccessMessage = isSpam
		? "Conversation marked as not spam"
		: "Conversation marked as spam";
	const spamErrorMessage = "Failed to update spam status";
	const blockSuccessMessage = isBlocked
		? "Visitor unblocked"
		: "Visitor blocked";
	const blockErrorMessage = "Failed to update visitor block status";
	const copyIdSuccessMessage = "Conversation ID copied";
	const copyIdErrorMessage = "Unable to copy conversation ID";
	const copyUrlSuccessMessage = "Conversation link copied";
	const copyUrlErrorMessage = "Unable to copy conversation link";
	const developerModeLabel = isDeveloperModeEnabled
		? "Disable developer mode"
		: "Enable developer mode";

	const suppressTooltipTemporarily = useCallback(() => {
		setTooltipSuppressed(true);

		if (tooltipTimeoutRef.current) {
			clearTimeout(tooltipTimeoutRef.current);
		}

		tooltipTimeoutRef.current = setTimeout(() => {
			setTooltipSuppressed(false);
			tooltipTimeoutRef.current = null;
		}, 200);
	}, []);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOpen(nextOpen);

			if (nextOpen) {
				setTooltipSuppressed(true);
				if (tooltipTimeoutRef.current) {
					clearTimeout(tooltipTimeoutRef.current);
					tooltipTimeoutRef.current = null;
				}
				return;
			}

			triggerRef.current?.blur();
			suppressTooltipTemporarily();
		},
		[suppressTooltipTemporarily]
	);

	const closeMenu = useCallback(() => {
		handleOpenChange(false);
	}, [handleOpenChange]);

	const runMenuAction = useCallback(
		(
			action: () => Promise<unknown | boolean>,
			options?: RunConversationActionOptions
		) =>
			runAction(action, {
				...options,
				beforeAction: () => {
					closeMenu();
					options?.beforeAction?.();
				},
			}),
		[closeMenu, runAction]
	);

	const preventHotkeysOptions = {
		enableOnContentEditable: false,
		enableOnFormTags: false,
		preventDefault: true,
	} as const;

	useHotkeys(
		"r",
		(event) => {
			event.preventDefault();

			if (resolvePending) {
				return;
			}

			void runMenuAction(
				async () => {
					if (isResolved) {
						await markOpen();
						return true;
					}
					await markResolved();
					return true;
				},
				{
					successMessage: resolveSuccessMessage,
					errorMessage: resolveErrorMessage,
				}
			);
		},
		{
			...preventHotkeysOptions,
			enabled: !resolvePending,
		},
		[
			isResolved,
			markOpen,
			markResolved,
			resolvePending,
			resolveErrorMessage,
			resolveSuccessMessage,
			runMenuAction,
		]
	);

	useHotkeys(
		"delete",
		(event) => {
			event.preventDefault();

			if (archivePending) {
				return;
			}

			void runMenuAction(
				async () => {
					if (isArchived) {
						await markUnarchived();
						return true;
					}
					await markArchived();
					return true;
				},
				{
					successMessage: archiveSuccessMessage,
					errorMessage: archiveErrorMessage,
				}
			);
		},
		{
			...preventHotkeysOptions,
			enabled: !archivePending,
		},
		[
			archivePending,
			archiveErrorMessage,
			archiveSuccessMessage,
			isArchived,
			markArchived,
			markUnarchived,
			runMenuAction,
		]
	);

	useHotkeys(
		"p",
		(event) => {
			event.preventDefault();

			if (spamPending) {
				return;
			}

			void runMenuAction(
				async () => {
					if (isSpam) {
						await markNotSpam();
						return true;
					}
					await markSpam();
					return true;
				},
				{
					successMessage: spamSuccessMessage,
					errorMessage: spamErrorMessage,
				}
			);
		},
		{
			...preventHotkeysOptions,
			enabled: !spamPending,
		},
		[
			isSpam,
			markNotSpam,
			markSpam,
			runMenuAction,
			spamErrorMessage,
			spamPending,
			spamSuccessMessage,
		]
	);

	useHotkeys(
		CONVERSATION_DEVELOPER_MODE_HOTKEY,
		(event) => {
			event.preventDefault();
			toggleDeveloperMode();
		},
		preventHotkeysOptions,
		[toggleDeveloperMode]
	);

	useEffect(
		() => () => {
			if (tooltipTimeoutRef.current) {
				clearTimeout(tooltipTimeoutRef.current);
			}
		},
		[]
	);

	const handleCopyId = useCallback(async () => {
		try {
			if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
				return false;
			}
			await navigator.clipboard.writeText(conversationId);
			return true;
		} catch (error) {
			console.error("Failed to copy conversation id", error);
			return false;
		}
	}, [conversationId]);

	const handleCopyUrl = useCallback(async () => {
		try {
			if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
				return false;
			}
			await navigator.clipboard.writeText(window.location.href);
			return true;
		} catch (error) {
			console.error("Failed to copy conversation URL", error);
			return false;
		}
	}, []);

	return (
		<div className={cn("flex items-center gap-2 pr-1", className)}>
			<DropdownMenu onOpenChange={handleOpenChange} open={open}>
				<TooltipOnHover
					content="More options"
					forceClose={open || tooltipSuppressed}
				>
					<DropdownMenuTrigger asChild>
						<Button ref={triggerRef} size="icon-small" variant="ghost">
							<Icon name="more" variant="filled" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipOnHover>
				<DropdownMenuContent
					align="end"
					className="min-w-56"
					side="top"
					sideOffset={4}
				>
					<DropdownMenuGroup>
						<DropdownMenuItem
							disabled={resolvePending}
							onSelect={(event) => {
								event.preventDefault();
								void runMenuAction(
									async () => {
										if (isResolved) {
											await markOpen();
											return true;
										}
										await markResolved();
										return true;
									},
									{
										successMessage: resolveSuccessMessage,
										errorMessage: resolveErrorMessage,
									}
								);
							}}
							shortcuts={["R"]}
						>
							{resolveLabel}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={archivePending}
							onSelect={(event) => {
								event.preventDefault();
								void runMenuAction(
									async () => {
										if (isArchived) {
											await markUnarchived();
											return true;
										}
										await markArchived();
										return true;
									},
									{
										successMessage: archiveSuccessMessage,
										errorMessage: archiveErrorMessage,
									}
								);
							}}
							shortcuts={["x"]}
						>
							{archiveLabel}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={spamPending}
							onSelect={(event) => {
								event.preventDefault();
								void runMenuAction(
									async () => {
										if (isSpam) {
											await markNotSpam();
											return true;
										}
										await markSpam();
										return true;
									},
									{
										successMessage: spamSuccessMessage,
										errorMessage: spamErrorMessage,
									}
								);
							}}
							shortcuts={["P"]}
						>
							{spamLabel}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!canToggleBlock || blockPending}
							onSelect={(event) => {
								event.preventDefault();
								void runMenuAction(
									async () => {
										if (!visitorId) {
											return false;
										}
										if (isBlocked) {
											await unblockVisitor();
											return true;
										}
										await blockVisitor();
										return true;
									},
									{
										successMessage: blockSuccessMessage,
										errorMessage: blockErrorMessage,
									}
								);
							}}
						>
							{blockLabel}
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={(event) => {
							event.preventDefault();
							closeMenu();
							toggleDeveloperMode();
						}}
						shortcuts={[...CONVERSATION_DEVELOPER_MODE_SHORTCUT_CHIPS]}
					>
						{developerModeLabel}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={(event) => {
							event.preventDefault();
							void runMenuAction(async () => handleCopyId(), {
								successMessage: copyIdSuccessMessage,
								errorMessage: copyIdErrorMessage,
							});
						}}
					>
						Copy conversation ID
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={(event) => {
							event.preventDefault();
							void runMenuAction(async () => handleCopyUrl(), {
								successMessage: copyUrlSuccessMessage,
								errorMessage: copyUrlErrorMessage,
							});
						}}
					>
						Copy conversation URL
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
