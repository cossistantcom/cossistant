"use client";

import { extractFilesFromClipboard } from "@cossistant/core/upload-constants";
import * as React from "react";
import { useRenderElement } from "../utils/use-render-element";

export type MultimodalInputProps = Omit<
	React.TextareaHTMLAttributes<HTMLTextAreaElement>,
	"value" | "onChange"
> & {
	value: string;
	onChange: (value: string) => void;
	onSubmit?: () => void;
	onFileSelect?: (files: File[]) => void;
	asChild?: boolean;
	className?: string;
	error?: Error | null;
	disabled?: boolean;
};

/**
 * Textarea tailored for support conversations. Handles keyboard submit,
 * clipboard uploads and auto-resizing while remaining composable via
 * `asChild`.
 */
export const MultimodalInput = (() => {
	const Component = React.forwardRef<HTMLTextAreaElement, MultimodalInputProps>(
		(
			{
				value,
				onChange,
				onSubmit,
				onFileSelect,
				className,
				asChild = false,
				error,
				disabled,
				...props
			},
			ref
		) => {
			const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

			React.useImperativeHandle(
				ref,
				() => innerRef.current as HTMLTextAreaElement
			);

			const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
				onChange(e.target.value);
			};

			const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
				// keyCode 229 covers browsers that fire Enter during IME
				// composition without setting isComposing (e.g. old Safari)
				const isComposing = e.nativeEvent.isComposing || e.keyCode === 229;
				if (e.key === "Enter" && !e.shiftKey && !isComposing) {
					e.preventDefault();
					onSubmit?.();
				}
				props.onKeyDown?.(e);
			};

			// Handle paste events for image/file attachments
			const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
				const files = extractFilesFromClipboard(e.clipboardData);

				if (files.length > 0 && onFileSelect) {
					e.preventDefault();
					onFileSelect(files);
				}

				props.onPaste?.(e);
			};

			// Auto-resize
			React.useLayoutEffect(() => {
				const el = innerRef.current;
				if (!el) {
					return;
				}
				// Reset height to auto to get the correct scrollHeight
				el.style.height = "auto";
				// Ensure overflow is visible during measurement
				const originalOverflow = el.style.overflow;
				el.style.overflow = "hidden";
				// Set the new height
				el.style.height = `${el.scrollHeight}px`;
				// Restore original overflow
				el.style.overflow = originalOverflow;
			}, [value]);

			return useRenderElement(
				"textarea",
				{
					className,
					asChild,
				},
				{
					ref: innerRef,
					props: {
						...props,
						value,
						rows: 1,
						onChange: handleChange,
						onKeyDown: handleKeyDown,
						onPaste: handlePaste,
						disabled,
						"aria-invalid": error ? "true" : undefined,
						"aria-describedby": error ? "multimodal-input-error" : undefined,
						style: {
							...props.style,
							minHeight: "1.5rem",
							overflow: "hidden",
						},
					},
				}
			);
		}
	);

	Component.displayName = "MultimodalInput";
	return Component;
})();

// File input component for multimodal input
export type FileInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
	onFileSelect?: (files: File[]) => void;
	asChild?: boolean;
};

/**
 * Hidden file selector that feeds uploads back into the multimodal input when
 * chat UIs want an explicit attachment button.
 */
export const FileInput = (() => {
	const Component = React.forwardRef<HTMLInputElement, FileInputProps>(
		({ onFileSelect, asChild = false, className, ...props }, ref) => {
			const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
				const files = Array.from(e.target.files || []);
				if (files.length > 0 && onFileSelect) {
					onFileSelect(files);
					// Reset input to allow selecting the same file again
					e.target.value = "";
				}
				props.onChange?.(e);
			};

			return useRenderElement(
				"input",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						type: "file",
						multiple: true,
						onChange: handleChange,
					},
				}
			);
		}
	);

	Component.displayName = "FileInput";
	return Component;
})();

// Export the old name for backward compatibility
export const SupportInput = MultimodalInput;
