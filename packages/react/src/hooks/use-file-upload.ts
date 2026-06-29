"use client";

import type { CossistantClient } from "@cossistant/core/client";
import {
	isImageMimeType,
	MAX_FILES_PER_MESSAGE,
	validateFiles,
} from "@cossistant/core/upload-constants";
import type {
	TimelinePartFile,
	TimelinePartImage,
} from "@cossistant/types/api/timeline-item";
import { useCallback, useState } from "react";
import { useOptionalSupportContext } from "../provider";

export type FileUploadPart = TimelinePartImage | TimelinePartFile;

export type UseFileUploadOptions = {
	/**
	 * Optional Cossistant client instance.
	 * If not provided, uses the client from SupportProvider context.
	 */
	client?: CossistantClient | null;
};

export type UseFileUploadReturn = {
	/**
	 * Upload files and return timeline parts ready to include in a message.
	 * Files are uploaded to S3 in parallel.
	 */
	uploadFiles: (
		files: File[],
		conversationId: string
	) => Promise<FileUploadPart[]>;

	/**
	 * Whether an upload is currently in progress.
	 */
	isUploading: boolean;

	/**
	 * Upload progress (0-100). Updates as files complete.
	 */
	progress: number;

	/**
	 * Error from the most recent upload attempt, if any.
	 */
	error: Error | null;

	/**
	 * Reset the upload state (clear errors and progress).
	 */
	reset: () => void;
};

/**
 * Hook for uploading files to S3 for inclusion in chat messages.
 * Handles validation, upload progress tracking, and error management.
 *
 * @example
 * ```tsx
 * const { uploadFiles, isUploading, error } = useFileUpload();
 *
 * const handleSend = async () => {
 *   if (files.length > 0) {
 *     const parts = await uploadFiles(files, conversationId);
 *     // Include parts in message...
 *   }
 * };
 * ```
 */
export function useFileUpload(
	options: UseFileUploadOptions = {}
): UseFileUploadReturn {
	const supportContext = useOptionalSupportContext();
	const contextClient = supportContext?.client ?? null;
	const client = options.client === undefined ? contextClient : options.client;

	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<Error | null>(null);

	const reset = useCallback(() => {
		setIsUploading(false);
		setProgress(0);
		setError(null);
	}, []);

	const uploadFiles = useCallback(
		async (
			files: File[],
			conversationId: string
		): Promise<FileUploadPart[]> => {
			if (files.length === 0) {
				return [];
			}

			// Validate files before upload
			const validationError = validateFiles(files);
			if (validationError) {
				const err = new Error(validationError);
				setError(err);
				throw err;
			}

			if (files.length > MAX_FILES_PER_MESSAGE) {
				const err = new Error(
					`Cannot upload more than ${MAX_FILES_PER_MESSAGE} files at once`
				);
				setError(err);
				throw err;
			}

			setIsUploading(true);
			setProgress(0);
			setError(null);

			try {
				if (!client) {
					throw new Error(
						"Cossistant client is not available. Please ensure you have configured your API key."
					);
				}

				const totalFiles = files.length;
				let completedFiles = 0;

				// Upload files in parallel
				const uploadPromises = files.map(async (file) => {
					// Generate presigned URL
					const uploadInfo = await client.generateUploadUrl({
						conversationId,
						contentType: file.type,
						fileName: file.name,
					});

					// Upload file to S3
					await client.uploadFile(file, uploadInfo.uploadUrl, file.type);

					// Update progress
					completedFiles += 1;
					setProgress(Math.round((completedFiles / totalFiles) * 100));

					// Return timeline part based on file type
					const isImage = isImageMimeType(file.type);

					if (isImage) {
						return {
							type: "image" as const,
							url: uploadInfo.publicUrl,
							mediaType: file.type,
							filename: file.name,
							size: file.size,
						} satisfies TimelinePartImage;
					}

					return {
						type: "file" as const,
						url: uploadInfo.publicUrl,
						mediaType: file.type,
						filename: file.name,
						size: file.size,
					} satisfies TimelinePartFile;
				});

				const parts = await Promise.all(uploadPromises);

				setIsUploading(false);
				setProgress(100);

				return parts;
			} catch (err) {
				const normalizedError =
					err instanceof Error ? err : new Error("Upload failed");
				setError(normalizedError);
				setIsUploading(false);
				throw normalizedError;
			}
		},
		[client]
	);

	return {
		uploadFiles,
		isUploading,
		progress,
		error,
		reset,
	};
}
