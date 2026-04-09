export type { CossistantConfig, CossistantError } from "@plasma/types";
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
  type PlasmaPartMetadata,
  type PlasmaPartMetadata as CossistantPartMetadata,
  type CossistantToolTimelineMetadata,
  type CossistantUIMessage,
  extractSources,
  extractToolCalls,
  type FromUIMessageContext,
  fromUIMessage,
  fromUIMessages,
  getPlasmaPartMetadata,
  getPlasmaPartMetadata as getCossistantPartMetadata,
  getCossistantToolTimelineMetadata,
  hasProcessingParts,
  isAISDKCompatiblePart,
  setPlasmaPartMetadata,
  setPlasmaPartMetadata as setCossistantPartMetadata,
  setCossistantToolTimelineMetadata,
  toUIMessage,
  toUIMessages,
} from "./ai-sdk-utils";
export { hasAnyRole, hasRole, parseCommaSeparatedRoles } from "./auth/roles";
export {
	CossistantClient,
	CossistantClient as PlasmaClient,
	CossistantClient as default,
	type CossistantClientOptions,
} from "./client";
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
