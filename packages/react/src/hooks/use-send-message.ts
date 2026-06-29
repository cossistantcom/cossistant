import type { CossistantClient } from "@cossistant/core/client";
import {
	isImageMimeType,
	validateFiles,
} from "@cossistant/core/upload-constants";
import { generateMessageId } from "@cossistant/core/utils";
import type { CreateConversationResponseBody } from "@cossistant/types/api/conversation";
import type {
	TimelineItem,
	TimelineItemParts,
	TimelinePartFile,
	TimelinePartImage,
} from "@cossistant/types/api/timeline-item";
import { useCallback, useState } from "react";

import { useOptionalSupportContext } from "../provider";

export type SendMessageOptions = {
	conversationId?: string | null;
	message: string;
	files?: File[];
	defaultTimelineItems?: TimelineItem[];
	visitorId?: string;
	/**
	 * Optional message ID to use for the optimistic update and API request.
	 * When not provided, a ULID will be generated on the client.
	 */
	messageId?: string;
	onSuccess?: (conversationId: string, messageId: string) => void;
	onError?: (error: Error) => void;
	/**
	 * Called immediately after a new conversation is initiated (before API call).
	 * Use this to immediately switch the UI to the new conversation ID for
	 * proper optimistic updates display.
	 */
	onConversationInitiated?: (conversationId: string) => void;
};

export type SendMessageResult = {
	conversationId: string;
	messageId: string;
	conversation?: CreateConversationResponseBody["conversation"];
	initialTimelineItems?: CreateConversationResponseBody["initialTimelineItems"];
};

export type UseSendMessageResult = {
	mutate: (options: SendMessageOptions) => void;
	mutateAsync: (
		options: SendMessageOptions
	) => Promise<SendMessageResult | null>;
	isPending: boolean;
	isUploading: boolean;
	error: Error | null;
	reset: () => void;
};

export type UseSendMessageOptions = {
	client?: CossistantClient | null;
};

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "string") {
		return new Error(error);
	}

	return new Error("Unknown error");
}

type BuildTimelineItemPayloadOptions = {
	body: string;
	conversationId: string;
	visitorId: string | null;
	messageId?: string;
	fileParts?: Array<TimelinePartImage | TimelinePartFile>;
};

function buildTimelineItemPayload({
	body,
	conversationId,
	visitorId,
	messageId,
	fileParts,
}: BuildTimelineItemPayloadOptions): TimelineItem {
	const nowIso = typeof window !== "undefined" ? new Date().toISOString() : "";
	const id = messageId ?? generateMessageId();

	// Build parts array: text first, then any file/image parts
	const parts: TimelineItemParts = [{ type: "text" as const, text: body }];

	if (fileParts && fileParts.length > 0) {
		parts.push(...fileParts);
	}

	return {
		id,
		conversationId,
		organizationId: "", // Will be set by backend
		type: "message" as const,
		text: body,
		parts,
		visibility: "public" as const,
		userId: null,
		aiAgentId: null,
		visitorId: visitorId ?? null,
		createdAt: nowIso,
		deletedAt: null,
	} satisfies TimelineItem;
}

/**
 * Upload files and return timeline parts for inclusion in a message.
 */
async function uploadFilesForMessage(
	client: CossistantClient,
	files: File[],
	conversationId: string
): Promise<Array<TimelinePartImage | TimelinePartFile>> {
	if (files.length === 0) {
		return [];
	}

	// Validate files first
	const validationError = validateFiles(files);
	if (validationError) {
		throw new Error(validationError);
	}

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

	return Promise.all(uploadPromises);
}

/**
 * Sends visitor messages while handling optimistic pending conversations and
 * exposing react-query-like mutation state.
 */
export function useSendMessage(
	options: UseSendMessageOptions = {}
): UseSendMessageResult {
	const supportContext = useOptionalSupportContext();
	const contextClient = supportContext?.client ?? null;
	const client = options.client === undefined ? contextClient : options.client;

	const [isPending, setIsPending] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const mutateAsync = useCallback(
		async (payload: SendMessageOptions): Promise<SendMessageResult | null> => {
			const {
				conversationId: providedConversationId,
				message,
				files = [],
				defaultTimelineItems = [],
				visitorId,
				messageId: providedMessageId,
				onSuccess,
				onError,
				onConversationInitiated,
			} = payload;

			// Allow empty message if there are files
			if (!message.trim() && files.length === 0) {
				const emptyMessageError = new Error(
					"Message cannot be empty (or attach files)"
				);
				setError(emptyMessageError);
				onError?.(emptyMessageError);
				return null;
			}

			setIsPending(true);
			setError(null);

			try {
				if (!client) {
					throw new Error(
						"Cossistant client is not available. Please ensure you have configured your API key."
					);
				}

				let conversationId = providedConversationId ?? undefined;
				let preparedDefaultTimelineItems = defaultTimelineItems;
				let initialConversation:
					| CreateConversationResponseBody["conversation"]
					| undefined;

				if (!conversationId) {
					const initiated = client.initiateConversation({
						defaultTimelineItems,
						visitorId: visitorId ?? undefined,
					});
					conversationId = initiated.conversationId;
					preparedDefaultTimelineItems = initiated.defaultTimelineItems;
					initialConversation = initiated.conversation;
					// Immediately notify about the new conversation ID so UI can switch
					// to reading from the right store key for optimistic updates
					onConversationInitiated?.(conversationId);
				}

				// Upload files BEFORE sending the message
				let fileParts: Array<TimelinePartImage | TimelinePartFile> = [];
				if (files.length > 0) {
					setIsUploading(true);
					try {
						fileParts = await uploadFilesForMessage(
							client,
							files,
							conversationId
						);
					} finally {
						setIsUploading(false);
					}
				}

				const timelineItemPayload = buildTimelineItemPayload({
					body: message,
					conversationId,
					visitorId: visitorId ?? null,
					messageId: providedMessageId,
					fileParts,
				});

				const response = await client.sendMessage({
					conversationId,
					item: {
						id: timelineItemPayload.id,
						text: timelineItemPayload.text ?? "",
						type: timelineItemPayload.type === "event" ? "event" : "message",
						visibility: timelineItemPayload.visibility,
						userId: timelineItemPayload.userId,
						aiAgentId: timelineItemPayload.aiAgentId,
						visitorId: timelineItemPayload.visitorId,
						createdAt: timelineItemPayload.createdAt,
						parts: timelineItemPayload.parts,
					},
					createIfPending: true,
				});

				const messageId = response.item.id;

				if (!messageId) {
					throw new Error("SendMessage response missing item.id");
				}

				const result: SendMessageResult = {
					conversationId,
					messageId,
				};

				if ("conversation" in response && response.conversation) {
					result.conversation = response.conversation;
					result.initialTimelineItems = response.initialTimelineItems;
				} else if (initialConversation) {
					result.conversation = initialConversation;
					result.initialTimelineItems = preparedDefaultTimelineItems;
				}

				setIsPending(false);
				setError(null);
				onSuccess?.(result.conversationId, result.messageId);
				return result;
			} catch (raw) {
				const normalised = toError(raw);
				setIsPending(false);
				setError(normalised);
				onError?.(normalised);
				throw normalised;
			}
		},
		[client]
	);

	const mutate = useCallback(
		(opts: SendMessageOptions) => {
			void mutateAsync(opts).catch(() => {
				// Swallow errors to mimic react-query behaviour for mutate
			});
		},
		[mutateAsync]
	);

	const reset = useCallback(() => {
		setError(null);
		setIsPending(false);
		setIsUploading(false);
	}, []);

	return {
		mutate,
		mutateAsync,
		isPending,
		isUploading,
		error,
		reset,
	};
}
