import type { DefaultMessage } from "@cossistant/types";
import type { IdentifyContactResponse } from "@cossistant/types/api/contact";
import type {
	CreateConversationRequestBody,
	CreateConversationResponseBody,
	GetConversationRequest,
	GetConversationResponse,
	ListConversationsRequest,
	ListConversationsResponse,
	MarkConversationSeenRequestBody,
	MarkConversationSeenResponseBody,
	SetConversationTypingResponseBody,
	SubmitConversationRatingRequestBody,
	SubmitConversationRatingResponseBody,
} from "@cossistant/types/api/conversation";
import type {
	SubmitFeedbackRequest,
	SubmitFeedbackResponse,
} from "@cossistant/types/api/feedback";
import type {
	SupportFeatureFlagMutationRequest,
	SupportFeatureFlagMutationResponse,
	SupportOnboardingUpdateRequest,
	SupportStateResponse,
} from "@cossistant/types/api/support";
import type {
	GetConversationTimelineItemsRequest,
	GetConversationTimelineItemsResponse,
	SendTimelineItemRequest,
	SendTimelineItemResponse,
	TimelineItem,
} from "@cossistant/types/api/timeline-item";
import {
	ConversationStatus,
	ConversationTimelineType,
	SenderType,
	TimelineItemVisibility,
} from "@cossistant/types/enums";
import type {
	AnyRealtimeEvent,
	RealtimeEvent,
} from "@cossistant/types/realtime-events";
import type { Conversation } from "@cossistant/types/schemas";
import { applySupportOnboardingUpdate } from "@cossistant/types/support-state";
import { RealtimeClient } from "./realtime-client";
import { shouldDeliverEvent } from "./realtime-event-filter";
import { CossistantRestClient } from "./rest-client";
import {
	type ConversationsStore,
	createConversationsStore,
} from "./store/conversations-store";
import {
	applyProcessingCompletedEvent,
	applyProcessingProgressEvent,
	clearProcessingFromTimelineItem,
	createProcessingStore,
	type ProcessingStore,
} from "./store/processing-store";
import {
	applyConversationSeenEvent,
	createSeenStore,
	type SeenStore,
} from "./store/seen-store";
import {
	createSupportStateStore,
	type SupportState,
	type SupportStateStore,
} from "./store/support-state-store";
import {
	createTimelineItemsStore,
	type TimelineItemsStore,
} from "./store/timeline-items-store";
import {
	applyConversationTypingEvent,
	clearTypingFromTimelineItem,
	createTypingStore,
	type TypingStore,
} from "./store/typing-store";
import {
	createWebsiteStore,
	type WebsiteState,
	type WebsiteStore,
} from "./store/website-store";
import type {
	AnySupportConfig,
	OnboardingMetadataForStep,
	RegisteredFeatureFlagName,
	RegisteredOnboardingStepId,
} from "./support-config";
import { isSupportFeatureFlagEnabled } from "./support-runtime";
import type {
	CossistantConfig,
	PublicWebsiteResponse,
	VisitorMetadata,
	VisitorResponse,
} from "./types";
import { generateConversationId, generateMessageId } from "./utils";

type PendingConversation = {
	conversation: Conversation;
	initialTimelineItems: TimelineItem[];
};

type InitiateConversationParams = {
	conversationId?: string;
	visitorId?: string | null;
	websiteId?: string | null;
	channel?: Conversation["channel"];
	title?: string;
	status?: Conversation["status"];
	defaultTimelineItems?: Array<DefaultMessage | TimelineItem>;
};

type InitiateConversationResult = {
	conversationId: string;
	conversation: Conversation;
	defaultTimelineItems: TimelineItem[];
};

export type CossistantClientOptions = {
	/** Supply an external seen store so the client shares state with callers. */
	seenStore?: SeenStore;
	/** Supply an external processing store so the client shares AI activity state with callers. */
	processingStore?: ProcessingStore;
	/** Supply an external typing store so the client shares state with callers. */
	typingStore?: TypingStore;
};

export type CossistantClientConfiguration = CossistantConfig & {
	support?: AnySupportConfig;
};

export class CossistantClient {
	private restClient: CossistantRestClient;
	private config: CossistantClientConfiguration;
	private pendingConversations = new Map<string, PendingConversation>();
	private websiteRequest: Promise<PublicWebsiteResponse> | null = null;
	private supportStateRequest: Promise<SupportStateResponse> | null = null;
	readonly conversationsStore: ConversationsStore;
	readonly timelineItemsStore: TimelineItemsStore;
	readonly websiteStore: WebsiteStore;
	readonly supportStateStore: SupportStateStore;
	readonly seenStore: SeenStore;
	readonly processingStore: ProcessingStore;
	readonly typingStore: TypingStore;
	readonly realtime: RealtimeClient;

	constructor(
		config: CossistantClientConfiguration,
		options?: CossistantClientOptions
	) {
		this.config = config;
		this.restClient = new CossistantRestClient(config);
		this.conversationsStore = createConversationsStore();
		this.timelineItemsStore = createTimelineItemsStore();
		this.websiteStore = createWebsiteStore();
		this.supportStateStore = createSupportStateStore();
		this.seenStore = options?.seenStore ?? createSeenStore();
		this.processingStore = options?.processingStore ?? createProcessingStore();
		this.typingStore = options?.typingStore ?? createTypingStore();
		this.realtime = new RealtimeClient({
			wsUrl: config.wsUrl,
			onEvent: (event) => this.handleRealtimeEvent(event),
		});
	}

	// Configuration updates
	updateConfiguration(config: Partial<CossistantClientConfiguration>): void {
		this.config = { ...this.config, ...config };
		this.restClient.updateConfiguration(config);
	}

	// Utility methods
	getConfiguration(): CossistantClientConfiguration {
		return { ...this.config };
	}

	isConversationPending(conversationId: string | null | undefined): boolean {
		if (!conversationId) {
			return false;
		}

		return this.pendingConversations.has(conversationId);
	}

	// Website information
	async fetchWebsite(
		params: { force?: boolean } = {}
	): Promise<PublicWebsiteResponse> {
		const { force = false } = params;
		const current: WebsiteState = this.websiteStore.getState();

		if (!force) {
			if (current.status === "success" && current.website) {
				return current.website;
			}
			if (this.websiteRequest) {
				return this.websiteRequest;
			}
		}

		this.websiteStore.setLoading();

		const request = this.restClient
			.getWebsite()
			.then((website) => {
				this.websiteStore.setWebsite(website);
				return website;
			})
			.catch((error) => {
				this.websiteStore.setError(error);
				throw error;
			})
			.finally(() => {
				if (this.websiteRequest === request) {
					this.websiteRequest = null;
				}
			});

		this.websiteRequest = request;

		return request;
	}

	async getWebsite(): Promise<PublicWebsiteResponse> {
		return this.fetchWebsite({ force: true });
	}

	async fetchSupportState(
		params: { force?: boolean } = {}
	): Promise<SupportStateResponse> {
		const { force = false } = params;
		const current = this.supportStateStore.getState();

		if (!force) {
			if (current.status === "success") {
				return {
					featureFlags: current.featureFlags,
					onboarding: current.onboarding,
				};
			}

			if (this.supportStateRequest) {
				return this.supportStateRequest;
			}
		}

		this.supportStateStore.setLoading();

		const request = this.restClient
			.getSupportState()
			.then((state) => {
				this.supportStateStore.setSupportState(state);
				return state;
			})
			.catch((error) => {
				this.supportStateStore.setError(error);
				throw error;
			})
			.finally(() => {
				if (this.supportStateRequest === request) {
					this.supportStateRequest = null;
				}
			});

		this.supportStateRequest = request;
		return request;
	}

	async getSupportState(): Promise<SupportStateResponse> {
		return this.fetchSupportState({ force: true });
	}

	isFeatureFlagEnabled(flag: RegisteredFeatureFlagName): boolean {
		return isSupportFeatureFlagEnabled(
			this.supportStateStore.getState().featureFlags,
			flag
		);
	}

	setWebsiteContext(websiteId: string, visitorId?: string): void {
		this.restClient.setWebsiteContext(websiteId, visitorId);
	}

	setVisitorBlocked(isBlocked: boolean): void {
		this.restClient.setVisitorBlocked(isBlocked);
	}

	async updateVisitorMetadata(
		metadata: VisitorMetadata
	): Promise<VisitorResponse> {
		return this.restClient.updateVisitorMetadata(metadata);
	}

	async identify(params: {
		externalId?: string;
		email?: string;
		name?: string;
		image?: string;
		metadata?: Record<string, unknown>;
		contactOrganizationId?: string;
	}): Promise<IdentifyContactResponse> {
		return this.restClient.identify(params);
	}

	async updateContactMetadata(
		metadata: Record<string, unknown>
	): Promise<VisitorResponse> {
		return this.restClient.updateContactMetadata(metadata);
	}

	async updateSupportOnboarding(
		update: SupportOnboardingUpdateRequest
	): Promise<SupportStateResponse> {
		const previous = this.supportStateStore.updateOptimistic((state) => ({
			...state,
			onboarding: applySupportOnboardingUpdate(state.onboarding, update),
		}));

		try {
			const response = await this.restClient.updateSupportOnboarding(update);
			this.supportStateStore.setSupportState(response);
			return response;
		} catch (error) {
			this.supportStateStore.setState(() => previous);
			this.supportStateStore.setError(error);
			throw error;
		}
	}

	completeOnboardingStep<TStepId extends RegisteredOnboardingStepId>(
		stepId: TStepId
	): Promise<SupportStateResponse> {
		return this.updateSupportOnboarding({ stepId, completed: true });
	}

	uncompleteOnboardingStep<TStepId extends RegisteredOnboardingStepId>(
		stepId: TStepId
	): Promise<SupportStateResponse> {
		return this.updateSupportOnboarding({ stepId, completed: false });
	}

	setOnboardingMetadata<TStepId extends RegisteredOnboardingStepId>(
		stepId: TStepId,
		metadata: OnboardingMetadataForStep<TStepId> | null
	): Promise<SupportStateResponse> {
		return this.updateSupportOnboarding({ stepId, metadata });
	}

	resetOnboarding(): Promise<SupportStateResponse> {
		return this.updateSupportOnboarding({ reset: true });
	}

	async mutateSupportFeatureFlags(
		request: SupportFeatureFlagMutationRequest
	): Promise<SupportFeatureFlagMutationResponse> {
		return this.restClient.mutateSupportFeatureFlags(request);
	}

	// Conversation management
	initiateConversation(
		params: InitiateConversationParams = {}
	): InitiateConversationResult {
		const conversationId = params.conversationId ?? generateConversationId();
		const now = typeof window !== "undefined" ? new Date().toISOString() : "";
		const timelineItems = (params.defaultTimelineItems ?? []).map((item) =>
			normalizeBootstrapTimelineItem(conversationId, item)
		);
		const existing = this.conversationsStore.getState().byId[conversationId];
		const baseVisitorId =
			params.visitorId ?? this.restClient.getCurrentVisitorId() ?? "";
		const baseWebsiteId =
			params.websiteId ?? this.restClient.getCurrentWebsiteId() ?? "";

		const conversation: Conversation = existing
			? {
					...existing,
					title: params.title ?? existing.title,
					status: params.status ?? existing.status,
					updatedAt: now,
					lastTimelineItem: timelineItems.at(-1) ?? existing.lastTimelineItem,
				}
			: {
					id: conversationId,
					title: params.title,
					createdAt: now,
					updatedAt: now,
					visitorId: baseVisitorId,
					websiteId: baseWebsiteId,
					channel: params.channel ?? "widget",
					status: params.status ?? ConversationStatus.OPEN,
					deletedAt: null,
					lastTimelineItem: timelineItems.at(-1),
				};

		this.conversationsStore.ingestConversation(conversation);

		if (timelineItems.length > 0) {
			this.timelineItemsStore.ingestPage(conversationId, {
				items: timelineItems,
				hasNextPage: false,
				nextCursor: undefined,
			});
		}

		if (!existing || this.pendingConversations.has(conversationId)) {
			this.pendingConversations.set(conversationId, {
				conversation,
				initialTimelineItems: timelineItems,
			});
		}

		return {
			conversationId,
			conversation,
			defaultTimelineItems: timelineItems,
		};
	}

	async createConversation(
		params?: Partial<CreateConversationRequestBody>
	): Promise<CreateConversationResponseBody> {
		const response = await this.restClient.createConversation(params);
		this.conversationsStore.ingestConversation(response.conversation);
		return response;
	}

	async listConversations(
		params?: Partial<ListConversationsRequest>
	): Promise<ListConversationsResponse> {
		const response = await this.restClient.listConversations(params);
		this.conversationsStore.ingestList(response);
		return response;
	}

	async getConversation(
		params: GetConversationRequest
	): Promise<GetConversationResponse> {
		const response = await this.restClient.getConversation(params);
		this.conversationsStore.ingestConversation(response.conversation);
		return response;
	}

	async markConversationSeen(
		params: {
			conversationId: string;
		} & Partial<MarkConversationSeenRequestBody>
	): Promise<MarkConversationSeenResponseBody> {
		return this.restClient.markConversationSeen(params);
	}

	async getConversationSeenData(params: { conversationId: string }) {
		return this.restClient.getConversationSeenData(params);
	}

	async setVisitorTyping(params: {
		conversationId: string;
		isTyping: boolean;
		visitorPreview?: string | null;
		visitorId?: string;
	}): Promise<SetConversationTypingResponseBody> {
		return this.restClient.setConversationTyping(params);
	}

	async submitConversationRating(
		params: {
			conversationId: string;
		} & SubmitConversationRatingRequestBody
	): Promise<SubmitConversationRatingResponseBody> {
		const response = await this.restClient.submitConversationRating(params);

		const existing =
			this.conversationsStore.getState().byId[response.conversationId];

		if (existing) {
			this.conversationsStore.ingestConversation({
				...existing,
				visitorRating: response.rating,
				visitorRatingAt: response.ratedAt,
			});
		}

		return response;
	}

	async submitFeedback(
		params: SubmitFeedbackRequest
	): Promise<SubmitFeedbackResponse> {
		return this.restClient.submitFeedback(params);
	}

	// Timeline items management

	async getConversationTimelineItems(
		params: GetConversationTimelineItemsRequest & { conversationId: string }
	): Promise<GetConversationTimelineItemsResponse> {
		const response = await this.restClient.getConversationTimelineItems(params);
		this.timelineItemsStore.ingestPage(params.conversationId, {
			items: response.items,
			hasNextPage: response.hasNextPage,
			nextCursor: response.nextCursor ?? undefined,
		});
		return response;
	}

	async sendMessage(
		params: SendTimelineItemRequest & { createIfPending?: boolean }
	): Promise<
		SendTimelineItemResponse & {
			conversation?: Conversation;
			initialTimelineItems?: TimelineItem[];
			wasConversationCreated?: boolean;
		}
	> {
		const { createIfPending, ...rest } = params;
		const optimisticId = rest.item.id ?? generateMessageId();
		const createdAt = rest.item.createdAt
			? rest.item.createdAt
			: typeof window !== "undefined"
				? new Date().toISOString()
				: "";

		// Add optimistic timeline item
		const optimisticTimelineItem: TimelineItem = {
			id: optimisticId,
			conversationId: rest.conversationId,
			organizationId: "", // Not available yet
			visibility: rest.item.visibility ?? TimelineItemVisibility.PUBLIC,
			type: rest.item.type ?? ConversationTimelineType.MESSAGE,
			text: rest.item.text,
			tool: rest.item.tool ?? null,
			parts:
				rest.item.parts && rest.item.parts.length > 0
					? rest.item.parts
					: rest.item.text
						? [{ type: "text" as const, text: rest.item.text }]
						: [],
			userId: rest.item.userId ?? null,
			visitorId: rest.item.visitorId ?? null,
			aiAgentId: rest.item.aiAgentId ?? null,
			createdAt,
			deletedAt: null,
		};

		this.timelineItemsStore.ingestTimelineItem(optimisticTimelineItem);

		const pending = this.pendingConversations.get(rest.conversationId);

		if (pending && createIfPending !== false) {
			try {
				const response = await this.restClient.createConversation({
					conversationId: rest.conversationId,
					visitorId: pending.conversation.visitorId || undefined,
					channel: pending.conversation.channel,
					defaultTimelineItems: [
						...pending.initialTimelineItems,
						optimisticTimelineItem,
					],
				});

				this.conversationsStore.ingestConversation(response.conversation);
				const createdItems = response.initialTimelineItems;
				const responsePreservedOptimisticId = createdItems.some(
					(createdItem) => createdItem.id === optimisticId
				);

				if (responsePreservedOptimisticId) {
					// Preferred path: backend preserved the optimistic ID.
					// Ingest directly so existing references can be reused and UI remains stable.
					this.timelineItemsStore.ingestPage(rest.conversationId, {
						items: createdItems,
						hasNextPage: false,
						nextCursor: undefined,
					});
				} else {
					// Fallback for mixed rollout: clear optimistic state and hydrate from server truth.
					this.timelineItemsStore.removeTimelineItem(
						rest.conversationId,
						optimisticId
					);
					this.timelineItemsStore.clearConversation(rest.conversationId);
					this.timelineItemsStore.ingestPage(rest.conversationId, {
						items: createdItems,
						hasNextPage: false,
						nextCursor: undefined,
					});
				}

				this.pendingConversations.delete(rest.conversationId);

				const item = createdItems.at(-1) ?? createdItems[0];

				return {
					item: item as TimelineItem,
					conversation: response.conversation,
					initialTimelineItems: response.initialTimelineItems,
					wasConversationCreated: true,
				} satisfies SendTimelineItemResponse & {
					conversation: Conversation;
					initialTimelineItems: TimelineItem[];
					wasConversationCreated: true;
				};
			} catch (error) {
				this.timelineItemsStore.removeTimelineItem(
					rest.conversationId,
					optimisticId
				);
				throw error;
			}
		}

		const { createdAt: _createdAt, ...restItem } = rest.item;

		const payload: SendTimelineItemRequest = {
			...rest,
			item: {
				...restItem,
				id: optimisticId,
			},
		};

		try {
			const response = await this.restClient.sendMessage(payload);

			// Finalize the timeline item
			this.timelineItemsStore.finalizeTimelineItem(
				rest.conversationId,
				optimisticId,
				response.item
			);
			return response;
		} catch (error) {
			this.timelineItemsStore.removeTimelineItem(
				rest.conversationId,
				optimisticId
			);
			throw error;
		}
	}

	handleRealtimeEvent(event: AnyRealtimeEvent): void {
		// Apply website/visitor event filtering
		const websiteId = this.restClient.getCurrentWebsiteId();
		const visitorId = this.restClient.getCurrentVisitorId();

		if (!shouldDeliverEvent(event, websiteId, visitorId)) {
			return;
		}

		if (event.type === "conversationCreated") {
			const { conversation } = event.payload;

			this.conversationsStore.ingestConversation({
				...conversation,
				lastTimelineItem: conversation.lastTimelineItem ?? undefined,
			});
		} else if (event.type === "timelineItemCreated") {
			// Clear typing state when a timeline item is created
			clearTypingFromTimelineItem(this.typingStore, event);
			clearProcessingFromTimelineItem(this.processingStore, event);

			// Ingest timeline item into store
			const timelineItem =
				this.timelineItemsStore.ingestRealtimeTimelineItem(event);

			// Update conversation with last timeline item
			const existingConversation =
				this.conversationsStore.getState().byId[timelineItem.conversationId];

			if (existingConversation) {
				// Check if this is a status-changing event timeline item
				const newStatus = this.extractStatusFromEventTimelineItem(timelineItem);

				const nextConversation = {
					...existingConversation,
					updatedAt: timelineItem.createdAt,
					lastTimelineItem: timelineItem,
					...(newStatus && { status: newStatus }),
				};

				this.conversationsStore.ingestConversation(nextConversation);
			}
		} else if (event.type === "timelineItemUpdated") {
			const timelineItem =
				this.timelineItemsStore.ingestRealtimeUpdatedTimelineItem(event);

			const existingConversation =
				this.conversationsStore.getState().byId[timelineItem.conversationId];

			if (
				existingConversation &&
				existingConversation.lastTimelineItem?.id === timelineItem.id
			) {
				this.conversationsStore.ingestConversation({
					...existingConversation,
					lastTimelineItem: timelineItem,
					updatedAt: new Date().toISOString(),
				});
			}
		} else if (event.type === "conversationSeen") {
			applyConversationSeenEvent(this.seenStore, event, {
				ignoreVisitorId: visitorId,
			});
		} else if (event.type === "conversationTyping") {
			applyConversationTypingEvent(this.typingStore, event, {
				ignoreVisitorId: visitorId,
			});
		} else if (event.type === "aiAgentProcessingProgress") {
			applyProcessingProgressEvent(this.processingStore, event);
		} else if (event.type === "aiAgentProcessingCompleted") {
			applyProcessingCompletedEvent(this.processingStore, event);
		} else if (event.type === "conversationUpdated") {
			this.handleConversationUpdated(event);
		} else if (event.type === "supportStateUpdated") {
			this.supportStateStore.setSupportState(event.payload.state);
		}
	}

	/**
	 * Extract conversation status from an event timeline item.
	 * Returns the new status if this is a status-changing event, otherwise null.
	 */
	private extractStatusFromEventTimelineItem(
		timelineItem: TimelineItem
	): ConversationStatus | null {
		if (timelineItem.type !== ConversationTimelineType.EVENT) {
			return null;
		}

		// Find the event part in the timeline item
		const eventPart = timelineItem.parts?.find(
			(part) =>
				typeof part === "object" &&
				part !== null &&
				"type" in part &&
				part.type === "event"
		);

		if (
			!eventPart ||
			typeof eventPart !== "object" ||
			!("eventType" in eventPart)
		) {
			return null;
		}

		const eventType = (eventPart as { eventType: string }).eventType;

		// Map event types to conversation status
		switch (eventType) {
			case "resolved":
				return ConversationStatus.RESOLVED;
			case "reopened":
				return ConversationStatus.OPEN;
			default:
				return null;
		}
	}

	/**
	 * Handle conversationUpdated event from realtime
	 * Updates conversation with new title (sentiment and escalation are dashboard-only)
	 */
	handleConversationUpdated(event: RealtimeEvent<"conversationUpdated">): void {
		const { conversationId, updates } = event.payload;

		const existingConversation =
			this.conversationsStore.getState().byId[conversationId];

		if (!existingConversation) {
			// Conversation not in store, ignore update
			return;
		}

		// Build the updated conversation
		// (sentiment and escalation are dashboard-only fields)
		const nextConversation = {
			...existingConversation,
			...(updates.title !== undefined && { title: updates.title ?? undefined }),
			...(updates.visitorTitle !== undefined && {
				visitorTitle: updates.visitorTitle,
			}),
			...(updates.visitorTitleLanguage !== undefined && {
				visitorTitleLanguage: updates.visitorTitleLanguage,
			}),
			...(updates.visitorLanguage !== undefined && {
				visitorLanguage: updates.visitorLanguage,
			}),
			...(updates.translationActivatedAt !== undefined && {
				translationActivatedAt: updates.translationActivatedAt,
			}),
			...(updates.translationChargedAt !== undefined && {
				translationChargedAt: updates.translationChargedAt,
			}),
			...(updates.status !== undefined && { status: updates.status }),
			...(updates.deletedAt !== undefined && {
				deletedAt: updates.deletedAt,
			}),
			updatedAt: new Date().toISOString(),
		};

		this.conversationsStore.ingestConversation(nextConversation);
	}

	// File upload methods
	/**
	 * Generate a presigned URL for uploading a file to S3.
	 */
	async generateUploadUrl(
		params: Omit<
			Parameters<CossistantRestClient["generateUploadUrl"]>[0],
			"websiteId"
		>
	) {
		return this.restClient.generateUploadUrl(params);
	}

	/**
	 * Upload a file to S3 using a presigned URL.
	 */
	async uploadFile(file: File, uploadUrl: string, contentType: string) {
		return this.restClient.uploadFile(file, uploadUrl, contentType);
	}

	/**
	 * Upload multiple files for a conversation message.
	 */
	async uploadFilesForMessage(files: File[], conversationId: string) {
		return this.restClient.uploadFilesForMessage(files, conversationId);
	}

	// Cleanup method
	destroy(): void {
		this.restClient.destroy();
		this.realtime.destroy();
	}
}

export type CossistantClientReference = {
	/**
	 * Local store containing conversation summaries and pagination state.
	 */
	conversationsStore: CossistantClient["conversationsStore"];
	/**
	 * Local store containing timeline items grouped by conversation.
	 */
	timelineItemsStore: CossistantClient["timelineItemsStore"];
	/**
	 * Local store containing website bootstrap data for the widget session.
	 */
	websiteStore: CossistantClient["websiteStore"];
	/**
	 * Local store containing feature flags and onboarding state for the session.
	 */
	supportStateStore: CossistantClient["supportStateStore"];
	/**
	 * Realtime client used for websocket connectivity.
	 *
	 * @remarks `RealtimeClient`
	 * @fumadocsType `RealtimeClient`
	 */
	realtime: CossistantClient["realtime"];
	/**
	 * Fetch the public website payload used to bootstrap the widget.
	 */
	fetchWebsite: CossistantClient["fetchWebsite"];
	/**
	 * Fetch support feature flags and onboarding state.
	 */
	fetchSupportState: CossistantClient["fetchSupportState"];
	/**
	 * Read whether a configured feature flag is enabled.
	 */
	isFeatureFlagEnabled: CossistantClient["isFeatureFlagEnabled"];
	/**
	 * Complete a configured onboarding step.
	 */
	completeOnboardingStep: CossistantClient["completeOnboardingStep"];
	/**
	 * Mark a configured onboarding step incomplete.
	 */
	uncompleteOnboardingStep: CossistantClient["uncompleteOnboardingStep"];
	/**
	 * Replace metadata stored for a configured onboarding step.
	 */
	setOnboardingMetadata: CossistantClient["setOnboardingMetadata"];
	/**
	 * Reset onboarding progress for the current visitor/contact.
	 */
	resetOnboarding: CossistantClient["resetOnboarding"];
	/**
	 * Identify the current visitor as a contact.
	 *
	 * @remarks `identify(params)`
	 */
	identify: CossistantClient["identify"];
	/**
	 * Update metadata stored on the current visitor/contact.
	 */
	updateVisitorMetadata: CossistantClient["updateVisitorMetadata"];
	/**
	 * List conversations for the current visitor.
	 */
	listConversations: CossistantClient["listConversations"];
	/**
	 * Fetch a single conversation by ID.
	 */
	getConversation: CossistantClient["getConversation"];
	/**
	 * Fetch timeline items for a conversation.
	 *
	 * @remarks `getConversationTimelineItems(params)`
	 */
	getConversationTimelineItems: CossistantClient["getConversationTimelineItems"];
	/**
	 * Send a timeline item to a conversation.
	 *
	 * @remarks `sendMessage(params)`
	 */
	sendMessage: CossistantClient["sendMessage"];
	/**
	 * Generate a presigned upload URL for a conversation attachment.
	 *
	 * @remarks `generateUploadUrl(params)`
	 */
	generateUploadUrl: CossistantClient["generateUploadUrl"];
	/**
	 * Upload a file to a previously generated presigned URL.
	 */
	uploadFile: CossistantClient["uploadFile"];
	/**
	 * Tear down any active network resources owned by the client.
	 */
	destroy: CossistantClient["destroy"];
};

function normalizeBootstrapTimelineItem(
	conversationId: string,
	item: DefaultMessage | TimelineItem
): TimelineItem {
	if (isDefaultMessage(item)) {
		const createdAt =
			typeof window !== "undefined" ? new Date().toISOString() : "";

		return {
			id: generateMessageId(),
			conversationId,
			organizationId: "", // Not available at this point
			type: ConversationTimelineType.MESSAGE,
			text: item.content,
			parts: [{ type: "text" as const, text: item.content }],
			visibility: TimelineItemVisibility.PUBLIC,
			userId:
				item.senderType === SenderType.TEAM_MEMBER
					? (item.senderId ?? null)
					: null,
			aiAgentId:
				item.senderType === SenderType.AI ? (item.senderId ?? null) : null,
			visitorId:
				item.senderType === SenderType.VISITOR ? (item.senderId ?? null) : null,
			createdAt,
			deletedAt: null,
		} satisfies TimelineItem;
	}

	const createdAt = item.createdAt
		? item.createdAt
		: typeof window !== "undefined"
			? new Date().toISOString()
			: "";

	return {
		...item,
		id: item.id ?? generateMessageId(),
		conversationId,
		organizationId: item.organizationId || "",
		type: item.type ?? ConversationTimelineType.MESSAGE,
		tool: item.tool ?? null,
		createdAt,
		deletedAt: item.deletedAt ?? null,
		userId: item.userId ?? null,
		aiAgentId: item.aiAgentId ?? null,
		visitorId: item.visitorId ?? null,
		visibility: item.visibility ?? TimelineItemVisibility.PUBLIC,
	} satisfies TimelineItem;
}

function isDefaultMessage(
	item: DefaultMessage | TimelineItem
): item is DefaultMessage {
	return (item as DefaultMessage).content !== undefined;
}
