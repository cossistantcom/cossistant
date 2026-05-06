export const SenderType = {
	VISITOR: "visitor",
	TEAM_MEMBER: "team_member",
	AI: "ai",
} as const;

export type SenderType = (typeof SenderType)[keyof typeof SenderType];

export const ConversationStatus = {
	OPEN: "open",
	RESOLVED: "resolved",
	SPAM: "spam",
} as const;

export type ConversationStatus =
	(typeof ConversationStatus)[keyof typeof ConversationStatus];

export const ConversationPriority = {
	LOW: "low",
	NORMAL: "normal",
	HIGH: "high",
	URGENT: "urgent",
} as const;

export const ConversationFieldSource = {
	AI: "ai",
	USER: "user",
} as const;

export const TimelineItemVisibility = {
	PUBLIC: "public",
	PRIVATE: "private",
} as const;

export const ConversationTimelineType = {
	MESSAGE: "message",
	EVENT: "event",
	IDENTIFICATION: "identification",
	TOOL: "tool",
} as const;

export type ConversationTimelineType =
	(typeof ConversationTimelineType)[keyof typeof ConversationTimelineType];

export const ConversationEventType = {
	ASSIGNED: "assigned",
	UNASSIGNED: "unassigned",
	PARTICIPANT_REQUESTED: "participant_requested",
	PARTICIPANT_JOINED: "participant_joined",
	PARTICIPANT_LEFT: "participant_left",
	STATUS_CHANGED: "status_changed",
	PRIORITY_CHANGED: "priority_changed",
	TAG_ADDED: "tag_added",
	TAG_REMOVED: "tag_removed",
	RESOLVED: "resolved",
	REOPENED: "reopened",
	VISITOR_BLOCKED: "visitor_blocked",
	VISITOR_UNBLOCKED: "visitor_unblocked",
	VISITOR_IDENTIFIED: "visitor_identified",
	// Private AI events (team only, not visible to visitors)
	AI_ANALYZED: "ai_analyzed",
	TITLE_GENERATED: "title_generated",
	AI_ESCALATED: "ai_escalated",
	AI_PAUSED: "ai_paused",
	AI_RESUMED: "ai_resumed",
} as const;

export const ConversationParticipationStatus = {
	REQUESTED: "requested",
	ACTIVE: "active",
	LEFT: "left",
	DECLINED: "declined",
} as const;

export const ConversationSentiment = {
	POSITIVE: "positive",
	NEGATIVE: "negative",
	NEUTRAL: "neutral",
} as const;

export type ConversationSentiment =
	(typeof ConversationSentiment)[keyof typeof ConversationSentiment];

export type ConversationParticipationStatus =
	(typeof ConversationParticipationStatus)[keyof typeof ConversationParticipationStatus];

export type ConversationEventType =
	(typeof ConversationEventType)[keyof typeof ConversationEventType];

export type TimelineItemVisibility =
	(typeof TimelineItemVisibility)[keyof typeof TimelineItemVisibility];

export type ConversationPriority =
	(typeof ConversationPriority)[keyof typeof ConversationPriority];

export type ConversationFieldSource =
	(typeof ConversationFieldSource)[keyof typeof ConversationFieldSource];

export const WebsiteInstallationTarget = {
	NEXTJS: "nextjs",
	REACT: "react",
} as const;

export const WebsiteStatus = {
	ACTIVE: "active",
	INACTIVE: "inactive",
} as const;

export type WebsiteStatus = (typeof WebsiteStatus)[keyof typeof WebsiteStatus];

export type WebsiteInstallationTarget =
	(typeof WebsiteInstallationTarget)[keyof typeof WebsiteInstallationTarget];

export const APIKeyType = {
	PRIVATE: "private",
	PUBLIC: "public",
} as const;

export type APIKeyType = (typeof APIKeyType)[keyof typeof APIKeyType];
