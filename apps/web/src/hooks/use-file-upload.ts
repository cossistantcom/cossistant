"use client";

import {
	isImageMimeType,
	MAX_FILES_PER_MESSAGE,
	validateFile,
	validateFiles,
} from "@plasma/core";
import type {
	TimelinePartFile,
	TimelinePartImage,
} from "@plasma/types/api/timeline-item";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";

export type FileUploadPart = TimelinePartImage | TimelinePartFile;

export type UseFileUploadOptions = {
	/**
	 * Called when upload starts for a file.
	 */
	onUploadStart?: (file: File) => void;

	/**
	 * Called when a file upload completes.
	 */
	onUploadComplete?: (file: File, part: FileUploadPart) => void;

	/**
	 * Called when all uploads complete.
	 */
	onAllUploadsComplete?: (parts: FileUploadPart[]) => void;

	/**
	 * Called when an upload fails.
	 */
	onError?: (error: Error, file?: File) => void;
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
 * Upload a file to S3 using a presigned URL.
 */
async function uploadToS3(
	file: File,
	uploadUrl: string,
	contentType: string
): Promise<void> {
	const response = await fetch(uploadUrl, {
		method: "PUT",
		body: file,
		headers: {
			"Content-Type": contentType,
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to upload file: ${response.status} ${response.statusText}`
		);
	}
}

/**
 * Hook for uploading files to S3 for inclusion in chat messages (dashboard version).
 * Uses TRPC to get presigned URLs and handles upload progress tracking.
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
	const { onUploadStart, onUploadComplete, onAllUploadsComplete, onError } =
		options;

	const trpc = useTRPC();
	const website = useWebsite();

	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<Error | null>(null);

	const { mutateAsync: createSignedUrl } = useMutation(
		trpc.upload.createSignedUrl.mutationOptions()
	);

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
				onError?.(err);
				throw err;
			}

			if (files.length > MAX_FILES_PER_MESSAGE) {
				const err = new Error(
					`Cannot upload more than ${MAX_FILES_PER_MESSAGE} files at once`
				);
				setError(err);
				onError?.(err);
				throw err;
			}

			setIsUploading(true);
			setProgress(0);
			setError(null);

			try {
				const totalFiles = files.length;
				let completedFiles = 0;
				const parts: FileUploadPart[] = [];

				// Upload files in parallel
				const uploadPromises = files.map(async (file) => {
					// Validate individual file
					const fileError = validateFile(file);
					if (fileError) {
						throw new Error(fileError);
					}

					onUploadStart?.(file);

					// Generate presigned URL via TRPC
					const uploadInfo = await createSignedUrl({
						contentType: file.type,
						fileName: file.name,
						websiteId: website.id,
						scope: {
							type: "conversation",
							organizationId: website.organizationId,
							websiteId: website.id,
							conversationId,
						},
						useCdn: false, // Files should not go to CDN
					});

					// Upload file to S3
					await uploadToS3(file, uploadInfo.uploadUrl, file.type);

					// Update progress
					completedFiles += 1;
					setProgress(Math.round((completedFiles / totalFiles) * 100));

					// Create timeline part based on file type
					const isImage = isImageMimeType(file.type);
					const part: FileUploadPart = isImage
						? {
								type: "image" as const,
								url: uploadInfo.publicUrl,
								mediaType: file.type,
								filename: file.name,
								size: file.size,
							}
						: {
								type: "file" as const,
								url: uploadInfo.publicUrl,
								mediaType: file.type,
								filename: file.name,
								size: file.size,
							};

					onUploadComplete?.(file, part);
					parts.push(part);

					return part;
				});

				await Promise.all(uploadPromises);

				setIsUploading(false);
				setProgress(100);
				onAllUploadsComplete?.(parts);

				return parts;
			} catch (err) {
				const normalizedError =
					err instanceof Error ? err : new Error("Upload failed");
				setError(normalizedError);
				setIsUploading(false);
				onError?.(normalizedError);
				throw normalizedError;
			}
		},
		[
			createSignedUrl,
			onAllUploadsComplete,
			onError,
			onUploadComplete,
			onUploadStart,
			website.id,
			website.organizationId,
		]
	);

	return {
		uploadFiles,
		isUploading,
		progress,
		error,
		reset,
	};
}
