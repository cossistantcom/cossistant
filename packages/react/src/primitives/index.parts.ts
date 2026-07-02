"use client";

export {
	TypingIndicator,
	type TypingIndicatorProps,
	type TypingParticipant,
	type TypingParticipantType,
} from "../support/components/typing-indicator";
export { SupportConfig as Config } from "../support-config";
export {
	Avatar,
	AvatarFallback,
	type AvatarFallbackProps,
	AvatarImage,
	type AvatarImageProps,
	type AvatarProps,
} from "./avatar";
export { Button, type ButtonProps } from "./button";
export {
	type CommandPackageManager,
	type CommandVariants,
	DEFAULT_PACKAGE_MANAGER,
	mapCommandVariants,
} from "./command-block-utils";
export {
	ConversationTimeline,
	ConversationTimelineContainer,
	type ConversationTimelineContainerProps,
	ConversationTimelineEmpty,
	type ConversationTimelineEmptyProps,
	ConversationTimelineLoading,
	type ConversationTimelineLoadingProps,
	type ConversationTimelineProps,
	type ConversationTimelineRenderProps,
} from "./conversation-timeline";
export {
	DaySeparator,
	DaySeparatorLabel,
	type DaySeparatorLabelProps,
	DaySeparatorLine,
	type DaySeparatorLineProps,
	type DaySeparatorProps,
	type DaySeparatorRenderProps,
	defaultFormatDate,
} from "./day-separator";
export {
	FeedbackCommentInput,
	type FeedbackCommentInputProps,
} from "./feedback-comment-input";
export {
	FeedbackRatingSelector,
	type FeedbackRatingSelectorProps,
	type FeedbackRatingSelectorSize,
} from "./feedback-rating-selector";
export {
	FeedbackTopicSelect,
	type FeedbackTopicSelectProps,
} from "./feedback-topic-select";
export {
	FileInput,
	type FileInputProps,
	MultimodalInput,
	type MultimodalInputProps,
	SupportInput as Input,
} from "./multimodal-input";
export { type PageDefinition, Router, type RouterProps } from "./router";
export {
	TimelineCodeBlock,
	type TimelineCodeBlockProps,
} from "./timeline-code-block";
export {
	TimelineCommandBlock,
	type TimelineCommandBlockProps,
} from "./timeline-command-block";
export {
	TimelineItem,
	TimelineItemContent,
	type TimelineItemContentMarkdownRenderers,
	type TimelineItemContentProps,
	type TimelineItemProps,
	type TimelineItemRenderProps,
	TimelineItemTimestamp,
	type TimelineItemTimestampProps,
} from "./timeline-item";
export {
	extractFileParts,
	extractImageParts,
	hasAttachments,
	TimelineItemAttachments,
	type TimelineItemAttachmentsProps,
	TimelineItemFiles,
	type TimelineItemFilesProps,
	TimelineItemImages,
	type TimelineItemImagesProps,
} from "./timeline-item-attachments";
export {
	TimelineItemGroup,
	TimelineItemGroupAvatar,
	type TimelineItemGroupAvatarProps,
	TimelineItemGroupContent,
	type TimelineItemGroupContentProps,
	TimelineItemGroupHeader,
	type TimelineItemGroupHeaderProps,
	type TimelineItemGroupProps,
	TimelineItemGroupReadIndicator,
	type TimelineItemGroupReadIndicatorProps,
	type TimelineItemGroupRenderProps,
	TimelineItemGroupSeenIndicator,
	type TimelineItemGroupSeenIndicatorProps,
} from "./timeline-item-group";
export { hasExpandedTimelineContent } from "./timeline-message-layout";
export {
	getTimelineLastReaderIds,
	type ResolveTimelineReadReceiptParticipant,
	resolveTimelineReadReceiptReaders,
	type TimelineReadReceiptReaderMeta,
	type TimelineResolvedReadReceipt,
} from "./timeline-read-receipts";
export {
	ToolActivityRow,
	type ToolActivityRowProps,
	type ToolActivityRowState,
	type ToolActivityRowTone,
} from "./tool-activity-row";
export {
	SupportTrigger as Trigger,
	type TriggerProps,
	type TriggerRenderProps,
} from "./trigger";
export {
	SupportWindow as Window,
	type WindowProps,
	type WindowRenderProps,
} from "./window";
