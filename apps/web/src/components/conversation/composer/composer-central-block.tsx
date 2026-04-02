"use client";

import { formatFileSize } from "@plasma/core";
import type {
	ClipboardEvent,
	FormEvent,
	KeyboardEvent,
	ReactNode,
	RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import {
	SegmentedControl,
	type SegmentedControlOption,
} from "@/components/ui/segmented-control";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	COMPOSER_EDITOR_SURFACE_CLASS_NAME,
	COMPOSER_MIN_EDITOR_HEIGHT_CLASS_NAME,
} from "./composer-editor-layout";
import { MentionPopover } from "./mention-popover";
import type { MentionStore } from "./mention-store";
import { StyledOverlay } from "./styled-overlay";
import type { UseMentionEditorReturn } from "./use-mention-editor";

type ComposerCentralBlockProps = {
	children: ReactNode;
	className?: string;
	isPrivate?: boolean;
};

type ComposerDefaultCentralBlockProps = {
	className?: string;
	value: string;
	autoFocus?: boolean;
	textareaOverlay?: ReactNode;
	disabled: boolean;
	error?: Error | null;
	files: File[];
	isPrivate: boolean;
	isUploading: boolean;
	uploadProgress: number;
	onRemoveFile?: (index: number) => void;
	onVisibilityChange?: (visibility: "public" | "private") => void;
	mentionEnabled: boolean;
	mentionEditor: UseMentionEditorReturn;
	mentionStore: MentionStore;
	placeholder: string;
	handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
	onFormSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onFileSelect?: (files: File[]) => void;
	renderAttachButton?: (props: {
		triggerFileInput: () => void;
		disabled: boolean;
	}) => ReactNode;
	triggerFileInput: () => void;
	isAttachDisabled: boolean;
	allowedFileTypes: string;
	canSubmit: boolean;
	fileInputRef: RefObject<HTMLInputElement | null>;
};

type ComposerVisibilityTabsProps = {
	isPrivate: boolean;
	onVisibilityChange?: (visibility: "public" | "private") => void;
};

type ComposerFileAttachmentsProps = {
	files: File[];
	isUploading: boolean;
	uploadProgress: number;
	onRemoveFile?: (index: number) => void;
};

type ComposerEditorProps = {
	autoFocus: boolean;
	className?: string;
	disabled: boolean;
	isPrivate: boolean;
	mentionEnabled: boolean;
	mentionEditor: UseMentionEditorReturn;
	mentionStore: MentionStore;
	placeholder: string;
	textareaOverlay?: ReactNode;
	value: string;
	error?: Error | null;
	handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
};

type ComposerActionsProps = {
	canSubmit: boolean;
	isAttachDisabled: boolean;
	isPrivate: boolean;
	isUploading: boolean;
	onFileSelect?: (files: File[]) => void;
	renderAttachButton?: (props: {
		triggerFileInput: () => void;
		disabled: boolean;
	}) => ReactNode;
	triggerFileInput: () => void;
	allowedFileTypes: string;
	fileInputRef: RefObject<HTMLInputElement | null>;
};

const composerVisibilityOptions = [
	{
		value: "public",
		label: "Reply",
		tooltipOnHover: {
			content: "Send a public reply visible to the visitor",
			shortcuts: ["N"],
		},
	},
	{
		value: "private",
		label: "Private note",
		colorVariant: "private",
		tooltipOnHover: {
			content: "Send a private note only visible to your team and AI",
			shortcuts: ["N"],
		},
	},
] as const satisfies readonly SegmentedControlOption<"public" | "private">[];

function ComposerVisibilityTabs({
	isPrivate,
	onVisibilityChange,
}: ComposerVisibilityTabsProps) {
	if (!onVisibilityChange) {
		return null;
	}

	return (
		<div className="px-1 pt-1">
			<SegmentedControl
				aria-label="Message visibility"
				onValueChange={onVisibilityChange}
				options={composerVisibilityOptions}
				size="sm"
				value={isPrivate ? "private" : "public"}
			/>
		</div>
	);
}

function ComposerFileAttachments({
	files,
	isUploading,
	uploadProgress,
	onRemoveFile,
}: ComposerFileAttachmentsProps) {
	if (files.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2 p-2">
			{isUploading ? (
				<div className="flex items-center gap-2 text-muted-foreground text-xs">
					<div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full bg-primary transition-all duration-300"
							style={{ width: `${uploadProgress}%` }}
						/>
					</div>
					<span>Uploading {uploadProgress}%</span>
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				{files.map((file, index) => (
					<div
						className={cn(
							"flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs",
							isUploading && "opacity-70"
						)}
						key={`${file.name}-${index}`}
					>
						<Icon className="h-3 w-3" name="attachment" />
						<span className="max-w-[150px] truncate">{file.name}</span>
						<span className="text-muted-foreground">
							{formatFileSize(file.size)}
						</span>
						{onRemoveFile && !isUploading ? (
							<TooltipOnHover content="Remove file">
								<Button
									className="ml-1"
									onClick={() => onRemoveFile(index)}
									size="icon-small"
									type="button"
									variant="ghost"
								>
									<Icon className="h-3 w-3" name="x" />
								</Button>
							</TooltipOnHover>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}

function ComposerEditor({
	autoFocus,
	className,
	disabled,
	isPrivate,
	mentionEnabled,
	mentionEditor,
	mentionStore,
	placeholder,
	textareaOverlay,
	value,
	error,
	handleKeyDown,
	handlePaste,
}: ComposerEditorProps) {
	return (
		<div
			className={cn(
				"scrollbar-thin scrollbar-track-fd-overlay scrollbar-thumb-border/30 hover:scrollbar-thumb-border/50 relative max-h-[280px] overflow-y-scroll",
				COMPOSER_MIN_EDITOR_HEIGHT_CLASS_NAME
			)}
			data-composer-editor-viewport="true"
			ref={mentionEditor.mentionViewportRef}
		>
			{mentionEnabled ? (
				<MentionPopover
					anchorRef={mentionEditor.mentionViewportRef}
					caretPosition={mentionEditor.mention.caretPosition}
					highlightedIndex={mentionEditor.mention.highlightedIndex}
					isActive={mentionEditor.mention.isActive}
					isLoading={mentionEditor.mention.isLoading}
					onSelect={mentionEditor.mention.selectMention}
					results={mentionEditor.mention.results}
				/>
			) : null}

			{mentionEditor.hasMentions ? (
				<StyledOverlay
					className={cn(
						"pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-foreground",
						COMPOSER_EDITOR_SURFACE_CLASS_NAME,
						className
					)}
					mentionStore={mentionStore}
					ref={mentionEditor.overlayRef}
					value={value}
				/>
			) : null}

			<textarea
				aria-describedby={error ? "multimodal-input-error" : undefined}
				aria-invalid={error ? "true" : undefined}
				autoFocus={autoFocus}
				className={cn(
					"flex-1 resize-none bg-transparent placeholder:text-primary/50 focus-visible:outline-none",
					COMPOSER_EDITOR_SURFACE_CLASS_NAME,
					mentionEditor.hasMentions
						? "text-transparent caret-foreground"
						: "text-foreground",
					textareaOverlay &&
						"text-transparent caret-transparent selection:bg-transparent placeholder:text-transparent",
					className
				)}
				disabled={disabled}
				onChange={mentionEditor.handleChange}
				onKeyDown={handleKeyDown}
				onPaste={handlePaste}
				onScroll={mentionEditor.handleScroll}
				onSelect={mentionEditor.handleSelect}
				placeholder={
					isPrivate
						? "Write a private note..."
						: mentionEnabled
							? `${placeholder} Type @ to mention...`
							: placeholder
				}
				ref={mentionEditor.textareaRef}
				rows={1}
				value={value}
			/>
			{textareaOverlay ? (
				<div
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-0 flex items-start overflow-hidden whitespace-pre-wrap break-words",
						COMPOSER_EDITOR_SURFACE_CLASS_NAME,
						className
					)}
					data-composer-textarea-overlay="true"
				>
					{textareaOverlay}
				</div>
			) : null}
		</div>
	);
}

function ComposerActions({
	canSubmit,
	isAttachDisabled,
	isPrivate,
	isUploading,
	onFileSelect,
	renderAttachButton,
	triggerFileInput,
	allowedFileTypes,
	fileInputRef,
}: ComposerActionsProps) {
	return (
		<div className="flex items-center justify-between pr-1 pb-1 pl-3">
			<div />
			<div className="flex items-center gap-0.5">
				{onFileSelect ? (
					<>
						{renderAttachButton ? (
							renderAttachButton({
								triggerFileInput,
								disabled: isAttachDisabled,
							})
						) : (
							<TooltipOnHover content="Attach files">
								<Button
									disabled={isAttachDisabled}
									onClick={triggerFileInput}
									size="icon"
									type="button"
									variant="ghost"
								>
									<Icon className="h-4 w-4" name="attachment" />
								</Button>
							</TooltipOnHover>
						)}

						<input
							accept={allowedFileTypes}
							className="hidden"
							disabled={isAttachDisabled}
							multiple
							onChange={(event) => {
								const selectedFiles = Array.from(event.target.files || []);
								if (selectedFiles.length > 0) {
									onFileSelect(selectedFiles);
									event.target.value = "";
								}
							}}
							ref={fileInputRef}
							type="file"
						/>
					</>
				) : null}

				<TooltipOnHover
					content={isUploading ? "Uploading files..." : "Send message"}
					shortcuts={isUploading ? undefined : ["mod", "enter"]}
				>
					<Button
						className={cn(
							canSubmit
								? isPrivate
									? "[&_svg]:text-plasma-yellow-600"
									: "[&_svg]:text-primary/90"
								: isPrivate
									? "[&_svg]:text-plasma-yellow-600/50"
									: "[&_svg]:text-primary/50"
						)}
						disabled={!canSubmit}
						size="icon"
						type="submit"
						variant="ghost"
					>
						{isUploading ? (
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
						) : (
							<Icon
								className="size-4"
								name="send"
								variant={canSubmit ? "filled" : "default"}
							/>
						)}
					</Button>
				</TooltipOnHover>
			</div>
		</div>
	);
}

export function ComposerCentralBlock({
	children,
	className,
	isPrivate = false,
}: ComposerCentralBlockProps) {
	return (
		<div
			className={cn(
				"relative flex h-fit flex-col rounded-[2px] border shadow-xs",
				isPrivate
					? "border-plasma-yellow-600/40 border-dashed bg-plasma-yellow-100/30 dark:border-plasma-yellow-600/20 dark:bg-plasma-yellow-100/5"
					: "border-border bg-background dark:border-border dark:bg-background-200",
				className
			)}
			data-composer-central-block="true"
		>
			{children}
		</div>
	);
}

export function ComposerDefaultCentralBlock({
	className,
	value,
	autoFocus = true,
	textareaOverlay,
	disabled,
	error,
	files,
	isPrivate,
	isUploading,
	uploadProgress,
	onRemoveFile,
	onVisibilityChange,
	mentionEnabled,
	mentionEditor,
	mentionStore,
	placeholder,
	handleKeyDown,
	handlePaste,
	onFormSubmit,
	onFileSelect,
	renderAttachButton,
	triggerFileInput,
	isAttachDisabled,
	allowedFileTypes,
	canSubmit,
	fileInputRef,
}: ComposerDefaultCentralBlockProps) {
	return (
		<form className="flex max-h-[50vh] flex-col gap-2" onSubmit={onFormSubmit}>
			{error ? (
				<div
					className="rounded-md bg-destructive-muted p-2 text-destructive text-xs"
					id="multimodal-input-error"
				>
					{error.message}
				</div>
			) : null}

			<ComposerFileAttachments
				files={files}
				isUploading={isUploading}
				onRemoveFile={onRemoveFile}
				uploadProgress={uploadProgress}
			/>

			<div className="relative">
				<div
					className={cn(
						"pointer-events-none absolute top-1 right-0 flex items-center justify-center px-3 py-1.5 text-plasma-yellow-600 text-xs transition-all duration-200",
						isPrivate ? "opacity-100" : "translate-y-0 opacity-0"
					)}
				>
					Not visible to visitor
				</div>

				<div className="bg-background">
					<ComposerCentralBlock isPrivate={isPrivate}>
						<ComposerVisibilityTabs
							isPrivate={isPrivate}
							onVisibilityChange={onVisibilityChange}
						/>
						<ComposerEditor
							autoFocus={autoFocus}
							className={className}
							disabled={disabled}
							error={error}
							handleKeyDown={handleKeyDown}
							handlePaste={handlePaste}
							isPrivate={isPrivate}
							mentionEditor={mentionEditor}
							mentionEnabled={mentionEnabled}
							mentionStore={mentionStore}
							placeholder={placeholder}
							textareaOverlay={textareaOverlay}
							value={value}
						/>
						<ComposerActions
							allowedFileTypes={allowedFileTypes}
							canSubmit={canSubmit}
							fileInputRef={fileInputRef}
							isAttachDisabled={isAttachDisabled}
							isPrivate={isPrivate}
							isUploading={isUploading}
							onFileSelect={onFileSelect}
							renderAttachButton={renderAttachButton}
							triggerFileInput={triggerFileInput}
						/>
					</ComposerCentralBlock>
				</div>
			</div>
		</form>
	);
}
