"use client";

import type { ConversationStatus } from "@plasma/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { PageHeader } from "../../ui/layout";
import { ConversationBasicActions } from "../actions/basic";
import { MoreConversationActions } from "../actions/more";
import {
	ConversationHeaderNavigation,
	type ConversationHeaderNavigationProps,
} from "./navigation";

const TITLE_PLACEHOLDER = "New conversation";
const TITLE_SAVE_DEBOUNCE_MS = 600;

function normalizeTitleInput(value: string): string | null {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function ConversationTitleInput({
	title,
	titleSource,
	onUpdateTitle,
}: {
	title?: string | null;
	titleSource?: "ai" | "user" | null;
	onUpdateTitle: (title: string | null) => Promise<unknown>;
}) {
	const [draftTitle, setDraftTitle] = useState(title ?? "");
	const [isDirty, setIsDirty] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const draftTitleRef = useRef(draftTitle);
	const isDirtyRef = useRef(isDirty);
	const isSavingRef = useRef(isSaving);
	const flushAfterSaveRef = useRef(false);
	const titleRef = useRef(title ?? "");
	const titleSourceRef = useRef(titleSource ?? null);

	useEffect(() => {
		draftTitleRef.current = draftTitle;
	}, [draftTitle]);

	useEffect(() => {
		isDirtyRef.current = isDirty;
	}, [isDirty]);

	useEffect(() => {
		isSavingRef.current = isSaving;
	}, [isSaving]);

	useEffect(() => {
		titleRef.current = title ?? "";
		titleSourceRef.current = titleSource ?? null;
	}, [title, titleSource]);

	useEffect(() => {
		if (isDirty || isSaving) {
			return;
		}

		const nextTitle = title ?? "";
		if (draftTitleRef.current === nextTitle) {
			return;
		}

		draftTitleRef.current = nextTitle;
		setDraftTitle(nextTitle);
	}, [isDirty, isSaving, title]);

	const saveDraftTitle = useCallback(async () => {
		if (isSavingRef.current) {
			flushAfterSaveRef.current = true;
			return;
		}

		const draftAtSave = draftTitleRef.current;
		const normalizedDraft = normalizeTitleInput(draftAtSave);
		const normalizedCurrentTitle = normalizeTitleInput(titleRef.current);
		const shouldPersist =
			normalizedDraft !== normalizedCurrentTitle ||
			titleSourceRef.current !== "user";

		if (!(isDirtyRef.current || shouldPersist)) {
			return;
		}

		isSavingRef.current = true;
		setIsSaving(true);

		try {
			await onUpdateTitle(normalizedDraft);

			if (draftTitleRef.current === draftAtSave) {
				setIsDirty(false);
			}
		} catch {
			if (draftTitleRef.current === draftAtSave) {
				const previousTitle = titleRef.current;
				draftTitleRef.current = previousTitle;
				setDraftTitle(previousTitle);
				setIsDirty(false);
			}
		} finally {
			setIsSaving(false);
			isSavingRef.current = false;

			if (flushAfterSaveRef.current) {
				flushAfterSaveRef.current = false;
				void saveDraftTitle();
			}
		}
	}, [onUpdateTitle]);

	useEffect(() => {
		if (!isDirty || isSaving) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void saveDraftTitle();
		}, TITLE_SAVE_DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [draftTitle, isDirty, isSaving, saveDraftTitle]);

	return (
		<div className="hidden min-w-0 flex-1 md:flex">
			<Input
				aria-label="Conversation title"
				className="h-6 border-transparent bg-transparent px-1 font-medium text-sm shadow-none placeholder:text-muted-foreground/70 dark:bg-transparent"
				onBlur={() => {
					if (!isDirty) {
						return;
					}

					void saveDraftTitle();
				}}
				onChange={(event) => {
					setDraftTitle(event.target.value);
					setIsDirty(true);
				}}
				placeholder={TITLE_PLACEHOLDER}
				value={draftTitle}
			/>
		</div>
	);
}

export type ConversationHeaderProps = {
	isLeftSidebarOpen: boolean;
	isRightSidebarOpen: boolean;
	onToggleLeftSidebar: () => void;
	onToggleRightSidebar: () => void;
	navigation: ConversationHeaderNavigationProps;
	conversationId: string;
	visitorId?: string | null;
	status?: ConversationStatus;
	deletedAt?: string | null;
	visitorIsBlocked?: boolean | null;
	title?: string | null;
	titleSource?: "ai" | "user" | null;
	onUpdateTitle: (title: string | null) => Promise<unknown>;
};

export function ConversationHeader({
	isLeftSidebarOpen,
	isRightSidebarOpen,
	onToggleLeftSidebar,
	onToggleRightSidebar,
	navigation,
	conversationId,
	visitorId,
	status,
	deletedAt,
	visitorIsBlocked,
	title,
	titleSource,
	onUpdateTitle,
}: ConversationHeaderProps) {
	return (
		<PageHeader className="z-10 border-b bg-background pl-3.5 2xl:border-0 2xl:bg-linear-to-b 2xl:bg-transparent 2xl:from-background 2xl:via-background 2xl:to-transparent dark:bg-background-50 2xl:dark:bg-transparent 2xl:dark:from-background-50 2xl:dark:via-background-50 2xl:dark:to-transparent">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				{!isLeftSidebarOpen && (
					<TooltipOnHover
						align="end"
						content="Click to open sidebar"
						shortcuts={["["]}
					>
						<Button
							className="ml-0.5"
							onClick={onToggleLeftSidebar}
							size="icon-small"
							variant="ghost"
						>
							<Icon filledOnHover name="sidebar-collapse" />
						</Button>
					</TooltipOnHover>
				)}
				<ConversationHeaderNavigation {...navigation} />
				<ConversationTitleInput
					onUpdateTitle={onUpdateTitle}
					title={title}
					titleSource={titleSource}
				/>
			</div>
			<div className="flex items-center gap-3">
				<ConversationBasicActions
					className="gap-3 pr-0"
					conversationId={conversationId}
					deletedAt={deletedAt ?? null}
					status={status}
					visitorId={visitorId}
				/>
				<MoreConversationActions
					conversationId={conversationId}
					deletedAt={deletedAt ?? null}
					status={status}
					visitorId={visitorId}
					visitorIsBlocked={visitorIsBlocked ?? null}
				/>
				{!isRightSidebarOpen && (
					<TooltipOnHover
						align="end"
						content="Click to open sidebar"
						shortcuts={["]"]}
					>
						<Button
							className="rotate-180"
							onClick={onToggleRightSidebar}
							size="icon-small"
							variant="ghost"
						>
							<Icon filledOnHover name="sidebar-collapse" />
						</Button>
					</TooltipOnHover>
				)}
			</div>
		</PageHeader>
	);
}
