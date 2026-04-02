import { ALLOWED_MIME_TYPES } from "@plasma/core";
import { useCallback, useRef, useState } from "react";

// Convert ALLOWED_MIME_TYPES to validation-friendly format with wildcards for image/* and text/*
const DEFAULT_ALLOWED_FILE_TYPES = [
	...ALLOWED_MIME_TYPES.filter(
		(type) => !(type.startsWith("image/") || type.startsWith("text/"))
	),
	"image/*",
	"text/*",
];

export type UseMultimodalInputOptions = {
	onSubmit?: (data: { message: string; files: File[] }) => void | Promise<void>;
	onError?: (error: Error) => void;
	maxFileSize?: number; // in bytes
	maxFiles?: number;
	allowedFileTypes?: string[]; // MIME types
};

export type UseMultimodalInputReturn = {
	// State
	message: string;
	files: File[];
	isSubmitting: boolean;
	error: Error | null;

	// Actions
	setMessage: (message: string) => void;
	addFiles: (files: File[]) => void;
	removeFile: (index: number) => void;
	clearFiles: () => void;
	submit: () => Promise<void>;
	reset: () => void;

	// Validation
	isValid: boolean;
	canSubmit: boolean;
};

/**
 * Manages message text, file attachments and validation for the multimodal
 * composer component. Provides ergonomic helpers for submit flows and error
 * reporting.
 */
export const useMultimodalInput = ({
	onSubmit,
	onError,
	maxFileSize = 10 * 1024 * 1024, // 10MB default
	maxFiles = 5,
	allowedFileTypes = DEFAULT_ALLOWED_FILE_TYPES,
}: UseMultimodalInputOptions = {}): UseMultimodalInputReturn => {
	const [message, setMessage] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Use ref to prevent re-renders when tracking file URLs
	const fileUrlsRef = useRef<string[]>([]);

	// Validation helpers
	const validateFile = useCallback(
		(file: File): string | null => {
			if (file.size > maxFileSize) {
				return `File "${file.name}" exceeds maximum size of ${maxFileSize / 1024 / 1024}MB`;
			}

			if (allowedFileTypes.length > 0) {
				const isAllowed = allowedFileTypes.some((type) => {
					if (type.endsWith("/*")) {
						const baseType = type.slice(0, -2);
						return file.type.startsWith(baseType);
					}
					return file.type === type;
				});

				if (!isAllowed) {
					return `File type "${file.type}" is not allowed`;
				}
			}

			return null;
		},
		[maxFileSize, allowedFileTypes]
	);

	// Actions
	const addFiles = useCallback(
		(newFiles: File[]) => {
			setError(null);

			// Check max files limit
			if (files.length + newFiles.length > maxFiles) {
				const err = new Error(
					`Cannot add files: maximum ${maxFiles} files allowed`
				);
				setError(err);
				onError?.(err);
				return;
			}

			// Validate each file
			for (const file of newFiles) {
				const validationError = validateFile(file);
				if (validationError) {
					const err = new Error(validationError);
					setError(err);
					onError?.(err);
					return;
				}
			}

			setFiles((prev) => [...prev, ...newFiles]);
		},
		[files.length, maxFiles, validateFile, onError]
	);

	const removeFile = useCallback((index: number) => {
		setFiles((prev) => {
			const newFiles = [...prev];
			newFiles.splice(index, 1);

			// Clean up object URL if it exists
			if (fileUrlsRef.current[index]) {
				URL.revokeObjectURL(fileUrlsRef.current[index]);
				fileUrlsRef.current.splice(index, 1);
			}

			return newFiles;
		});
		setError(null);
	}, []);

	const clearFiles = useCallback(() => {
		// Clean up all object URLs
		for (const url of fileUrlsRef.current) {
			URL.revokeObjectURL(url);
		}
		fileUrlsRef.current = [];

		setFiles([]);
		setError(null);
	}, []);

	const reset = useCallback(() => {
		setMessage("");
		clearFiles();
		setError(null);
		setIsSubmitting(false);
	}, [clearFiles]);

	const submit = useCallback(async () => {
		if (!onSubmit) {
			return;
		}

		const trimmedMessage = message.trim();
		if (!trimmedMessage && files.length === 0) {
			const err = new Error("Please provide a message or attach files");
			setError(err);
			onError?.(err);
			return;
		}

		const previousState = {
			message,
			files,
			fileUrls: [...fileUrlsRef.current],
		};

		setIsSubmitting(true);
		setError(null);
		setMessage("");
		setFiles([]);
		fileUrlsRef.current = [];

		try {
			await onSubmit({ message: trimmedMessage, files: previousState.files });

			for (const url of previousState.fileUrls) {
				URL.revokeObjectURL(url);
			}
			reset();
		} catch (err) {
			setMessage(previousState.message);
			setFiles(previousState.files);
			fileUrlsRef.current = previousState.fileUrls;

			const _error = err instanceof Error ? err : new Error("Failed to submit");
			setError(_error);
			onError?.(_error);
		} finally {
			setIsSubmitting(false);
		}
	}, [message, files, onSubmit, onError, reset]);

	// Computed values
	const isValid = message.trim().length > 0 || files.length > 0;
	const canSubmit = isValid && !isSubmitting && !error;

	return {
		// State
		message,
		files,
		isSubmitting,
		error,

		// Actions
		setMessage,
		addFiles,
		removeFile,
		clearFiles,
		submit,
		reset,

		// Validation
		isValid,
		canSubmit,
	};
};
