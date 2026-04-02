"use client";

import {
	FILE_INPUT_ACCEPT,
	formatFileSize,
	MAX_FILE_SIZE,
	MAX_FILES_PER_MESSAGE,
} from "@plasma/core";
import type React from "react";
import { useRef } from "react";
import { useComposerRefocus } from "../../hooks/use-composer-refocus";
import * as Primitive from "../../primitives";
import { useSupportText } from "../text";
import { cn } from "../utils";
import Icon from "./icons";
import { Watermark } from "./watermark";

export type MultimodalInputProps = {
	className?: string;
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onFileSelect?: (files: File[]) => void;
	placeholder?: string;
	disabled?: boolean;
	isSubmitting?: boolean;
	isUploading?: boolean;
	uploadProgress?: number;
	error?: Error | null;
	files?: File[];
	onRemoveFile?: (index: number) => void;
	maxFiles?: number;
	maxFileSize?: number;
	allowedFileTypes?: string;
};

export const MultimodalInput: React.FC<MultimodalInputProps> = ({
	className,
	value,
	onChange,
	onSubmit,
	onFileSelect,
	placeholder,
	disabled = false,
	isSubmitting = false,
	isUploading = false,
	uploadProgress = 0,
	error,
	files = [],
	onRemoveFile,
	maxFiles = MAX_FILES_PER_MESSAGE,
	maxFileSize = MAX_FILE_SIZE,
	allowedFileTypes = FILE_INPUT_ACCEPT,
}) => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const hasContent = value.trim().length > 0 || files.length > 0;
	const { focusComposer, inputRef } = useComposerRefocus({
		disabled,
		hasContent,
		isSubmitting: isSubmitting || isUploading,
	});
	const canSubmit = !disabled && hasContent && !isUploading;
	const text = useSupportText();
	const resolvedPlaceholder =
		placeholder ?? text("component.multimodalInput.placeholder");

	const handleSubmit = () => {
		if (!canSubmit) {
			return;
		}

		onSubmit();
		// Try focusing immediately for optimistic submission UX, then ensure focus
		// sticks after the submit button handles the click.
		focusComposer();
		requestAnimationFrame(() => {
			focusComposer();
		});
	};

	const handleFormSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		handleSubmit();
	};

	const handleAttachClick = () => {
		if (files.length < maxFiles) {
			fileInputRef.current?.click();
		}
	};

	return (
		<form className="flex flex-col gap-2" onSubmit={handleFormSubmit}>
			{/* Error message */}
			{error && (
				<div
					className="rounded-md bg-co-destructive-muted p-2 text-co-destructive text-xs"
					id="multimodal-input-error"
				>
					{error.message}
				</div>
			)}

			{/* File attachments */}
			{files.length > 0 && (
				<div className="flex flex-col gap-2 p-2">
					{/* Upload progress indicator */}
					{isUploading && (
						<div className="flex items-center gap-2 text-co-muted-foreground text-xs">
							<div className="h-1 flex-1 overflow-hidden rounded-full bg-co-muted">
								<div
									className="h-full bg-co-primary transition-all duration-300"
									style={{ width: `${uploadProgress}%` }}
								/>
							</div>
							<span>{uploadProgress}%</span>
						</div>
					)}
					<div className="flex flex-wrap gap-2">
						{files.map((file, index) => (
							<div
								className={cn(
									"flex items-center gap-2 rounded-md bg-co-muted px-2 py-1 text-xs",
									isUploading && "opacity-70"
								)}
								key={`${file.name}-${index}`}
							>
								<Icon className="h-3 w-3" name="attachment" />
								<span className="max-w-[150px] truncate">{file.name}</span>
								<span className="text-co-muted-foreground">
									{formatFileSize(file.size)}
								</span>
								{onRemoveFile && !isUploading && (
									<button
										aria-label={text("common.actions.removeFile", {
											fileName: file.name,
										})}
										className="ml-1 hover:text-co-destructive"
										onClick={() => onRemoveFile(index)}
										type="button"
									>
										<Icon className="h-3 w-3" name="close" />
									</button>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{/* Input area */}
			<div className="group/multimodal-input flex flex-col rounded border border-co-border bg-co-background ring-offset-2 focus-within:ring-1 focus-within:ring-co-primary/10 dark:bg-co-background-200">
				<div className="max-h-[200px] overflow-y-auto">
					<Primitive.MultimodalInput
						autoFocus
						className={cn(
							"w-full resize-none overflow-hidden p-3 text-co-foreground text-sm placeholder:text-co-primary/50 focus-visible:outline-none",
							className
						)}
						disabled={disabled}
						error={error}
						onChange={onChange}
						onFileSelect={onFileSelect}
						onSubmit={handleSubmit}
						placeholder={resolvedPlaceholder}
						ref={inputRef}
						value={value}
					/>
				</div>

				<div className="flex items-center justify-between py-1 pr-1 pl-3">
					<Watermark />

					<div className="flex items-center gap-0.5">
						{/* File attachment button */}
						{onFileSelect && (
							<>
								<button
									aria-label={text("common.actions.attachFiles")}
									className={cn(
										"group flex h-8 w-8 items-center justify-center rounded-md text-co-muted-foreground hover:bg-co-muted hover:text-co-foreground disabled:cursor-not-allowed disabled:opacity-50",
										files.length >= maxFiles && "opacity-50"
									)}
									disabled={
										disabled || isSubmitting || files.length >= maxFiles
									}
									onClick={handleAttachClick}
									type="button"
								>
									<Icon className="h-4 w-4" name="attachment" />
								</button>

								<Primitive.FileInput
									accept={allowedFileTypes}
									className="hidden"
									disabled={
										disabled || isSubmitting || files.length >= maxFiles
									}
									onFileSelect={onFileSelect}
									ref={fileInputRef}
								/>
							</>
						)}

						{/* Send button */}
						<SendButton disabled={!canSubmit} isUploading={isUploading} />
					</div>
				</div>
			</div>
		</form>
	);
};

export type SendButtonProps = {
	className?: string;
	disabled?: boolean;
	isUploading?: boolean;
};

export const SendButton: React.FC<SendButtonProps> = ({
	className,
	disabled = false,
	isUploading = false,
}) => (
	<Primitive.Button
		className={cn(
			"group flex h-8 w-8 items-center justify-center rounded-md text-co-primary hover:bg-co-muted disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		disabled={disabled}
		type="submit"
	>
		{isUploading ? (
			<div className="h-4 w-4 animate-spin rounded-full border-2 border-co-primary border-t-transparent" />
		) : (
			<Icon className="h-4 w-4" filledOnHover name="send" />
		)}
	</Primitive.Button>
);
