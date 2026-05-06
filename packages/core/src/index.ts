export type { CossistantConfig, CossistantError } from "@cossistant/types";
// AI SDK v6 conversion utilities
export {
	type AISDKFilePart,
	type AISDKPart,
	type AISDKReasoningPart,
	type AISDKSourceDocumentPart,
	type AISDKSourceUrlPart,
	type AISDKStepStartPart,
	type AISDKTextPart,
	type AISDKToolPart,
	type CossistantMessageMetadata,
	type CossistantPartMetadata,
	type CossistantToolTimelineMetadata,
	type CossistantUIMessage,
	extractSources,
	extractToolCalls,
	type FromUIMessageContext,
	fromUIMessage,
	fromUIMessages,
	getCossistantPartMetadata,
	getCossistantToolTimelineMetadata,
	hasProcessingParts,
	isAISDKCompatiblePart,
	setCossistantPartMetadata,
	setCossistantToolTimelineMetadata,
	toUIMessage,
	toUIMessages,
} from "./ai-sdk-utils";
export {
	hasAnyRole,
	hasRole,
	parseCommaSeparatedRoles,
} from "./auth/roles";
export {
	CossistantClient,
	CossistantClient as default,
	type CossistantClientConfiguration,
	type CossistantClientOptions,
} from "./client";
export {
	createFeedbackTimelinePart,
	type FeedbackTimelineMetadataEntry,
	type FeedbackTimelinePartInput,
	formatFeedbackMetadataValue,
	formatFeedbackRatingLabel,
	formatFeedbackReviewPreview,
	getFeedbackTimelineComment,
	getFeedbackTimelineMetadataEntries,
	getTimelineItemFeedback,
	isFeedbackTimelineItem,
	isTimelinePartFeedback,
	resolveFeedbackTimelineText,
	WIDGET_FEEDBACK_REVIEW_PREVIEW,
} from "./feedback-timeline";
export {
	type HumanAgentDisplay,
	type HumanAgentIdentity,
	type HumanAgentSurface,
	normalizeHumanAgentName,
	type ResolveHumanAgentDisplayOptions,
	resolveHumanAgentDisplay,
} from "./human-agent-display";
export { normalizeLocale } from "./locale-utils";
// Privacy filter utilities
export {
	type Audience,
	countVisibleParts,
	extractVisibleText,
	type FilterOptions,
	filterMessageForAudience,
	filterMessagesForAudience,
	filterTimelineItemForAudience,
	filterTimelineItemsForAudience,
	hasVisibleContent,
	PrivacyPresets,
} from "./privacy-filter";
// Realtime client
export {
	type PrivateKeyAuthConfig,
	type RealtimeAuthConfig,
	RealtimeClient,
	type RealtimeClientOptions,
	type RealtimeConnectionState,
	type RealtimeConnectionStatus,
	type SessionAuthConfig,
	type VisitorAuthConfig,
} from "./realtime-client";
// Realtime event filter
export {
	getTargetVisitorId,
	shouldDeliverEvent,
} from "./realtime-event-filter";
// Environment variable resolution
export {
	detectFramework,
	type Framework,
	getEnvVarName,
	resolvePublicKey,
} from "./resolve-public-key";
export { CossistantRestClient } from "./rest-client";
export {
	type ConversationPagination,
	type ConversationsState,
	type ConversationsStore,
	type ConversationWithSeen,
	createConversationsStore,
	getConversationById,
	getConversationPagination,
	getConversations,
} from "./store/conversations-store";
export {
	applyProcessingCompletedEvent,
	applyProcessingProgressEvent,
	type ConversationProcessingEntry,
	type ConversationProcessingTool,
	clearProcessingFromTimelineItem,
	createProcessingStore,
	getConversationProcessing,
	type ProcessingState,
	type ProcessingStore,
	type ProcessingStoreDependencies,
	type ProcessingToolState,
} from "./store/processing-store";
export {
	applyConversationSeenEvent,
	type ConversationSeenState,
	createSeenStore,
	hydrateConversationSeen,
	type SeenActorType,
	type SeenEntry,
	type SeenState,
	type SeenStore,
	upsertConversationSeen,
} from "./store/seen-store";
export {
	createSupportStateStore,
	EMPTY_ONBOARDING_STATE,
	INITIAL_SUPPORT_STATE,
	normalizeSupportOnboardingState,
	type SupportState,
	type SupportStateError,
	type SupportStateStatus,
	type SupportStateStore,
} from "./store/support-state-store";
export {
	createSupportStore,
	type DefaultRoutes,
	type NavigationState,
	type RouteRegistry,
	type SUPPORT_PAGES,
	type SupportConfig,
	type SupportNavigation,
	type SupportPage,
	type SupportStore,
	type SupportStoreActions,
	type SupportStoreOptions,
	type SupportStoreState,
	type SupportStoreStorage,
} from "./store/support-store";
export {
	type ConversationTimelineItemsState,
	createTimelineItemsStore,
	getConversationTimelineItems,
	type TimelineItemsState,
	type TimelineItemsStore,
} from "./store/timeline-items-store";
export {
	applyConversationTypingEvent,
	type ConversationTypingState,
	clearTypingFromTimelineItem,
	clearTypingState,
	createTypingStore,
	getConversationTyping,
	setTypingState,
	type TypingActorType,
	type TypingEntry,
	type TypingState,
	type TypingStore,
	type TypingStoreDependencies,
} from "./store/typing-store";
export {
	createWebsiteStore,
	getWebsiteState,
	type WebsiteError,
	type WebsiteState,
	type WebsiteStatus,
	type WebsiteStore,
} from "./store/website-store";
export {
	type AnySupportConfig,
	createSupport,
	getSupportFeatureFlags,
	getSupportOnboardingSteps,
	type OnboardingMetadataForStep,
	type RegisteredFeatureFlagName,
	type RegisteredOnboardingMetadata,
	type RegisteredOnboardingStepId,
	type RegisteredSupportConfig,
	type SupportConfigDefinition,
	type SupportFeatureFlagName,
	type SupportJsonObject,
	type SupportJsonPrimitive,
	type SupportJsonValue,
	type SupportOnboardingConfig,
	type SupportOnboardingMetadata,
	type SupportOnboardingStepDefinition,
	type SupportOnboardingStepId,
	type SupportRegister,
} from "./support-config";
export {
	createSupportController,
	PENDING_SUPPORT_CONVERSATION_ID,
	type SupportController,
	type SupportControllerConfigurationError,
	type SupportControllerConversationEndEvent,
	type SupportControllerConversationStartEvent,
	type SupportControllerErrorEvent,
	type SupportControllerEvent,
	type SupportControllerEventType,
	type SupportControllerMessageReceivedEvent,
	type SupportControllerMessageSentEvent,
	type SupportControllerOptions,
	type SupportControllerSnapshot,
} from "./support-controller";
export {
	getSupportOnboardingSnapshot,
	isSupportFeatureFlagEnabled,
	type SupportOnboardingSnapshot,
	type SupportOnboardingStepSnapshot,
} from "./support-runtime";
export {
	areLanguagesEquivalent,
	getPrimaryLanguageTag,
	getTimelineItemTranslation,
	isTimelinePartTranslation,
	normalizeLanguageTag,
	resolveConversationTitle,
	resolveTimelineItemText,
	shouldTranslateBetweenLanguages,
	type TranslationAudience,
} from "./translation";
// Core-specific exports
export { CossistantAPIError } from "./types";
export type { TypingReporter, TypingReporterConfig } from "./typing-reporter";
// Typing reporter shared logic
export {
	createTypingReporter,
	TYPING_KEEP_ALIVE_MS,
	TYPING_PREVIEW_MAX_LENGTH,
	TYPING_SEND_INTERVAL_MS,
	TYPING_STOP_DELAY_MS,
} from "./typing-reporter";
// Upload constants and utilities
export {
	ALLOWED_FILE_TYPES_DESCRIPTION,
	ALLOWED_MIME_TYPES,
	extractFilesFromClipboard,
	FILE_INPUT_ACCEPT,
	formatFileSize,
	isAllowedMimeType,
	isImageMimeType,
	MAX_FILE_SIZE,
	MAX_FILES_PER_MESSAGE,
	validateFile,
	validateFiles,
} from "./upload-constants";
// Utility exports
export { generateConversationId, generateMessageId } from "./utils";
export { collectVisitorData, type VisitorData } from "./visitor-data";
export {
	generateVisitorName,
	getVisitorNameWithFallback,
} from "./visitor-name";
export {
	clearAllVisitorIds,
	clearVisitorId,
	getVisitorId,
	setVisitorId,
} from "./visitor-tracker";
