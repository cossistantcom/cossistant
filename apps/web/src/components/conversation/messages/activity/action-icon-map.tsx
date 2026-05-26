import type { TimelinePartEvent } from "@cossistant/types/api/timeline-item";
import type { LucideIcon } from "lucide-react";
import {
	Bot,
	Brain,
	CircleCheck,
	CircleDot,
	DollarSign,
	Flag,
	Heading,
	Pause,
	Play,
	RotateCcw,
	Search,
	ShieldCheck,
	ShieldX,
	Tag,
	UserCheck,
	UserMinus,
	UserPlus,
	Users,
	Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityIcon } from "./activity-wrapper";

type ActionIconDefinition = {
	key: string;
	Icon: LucideIcon;
};

const DEFAULT_TOOL_ICON: ActionIconDefinition = {
	key: "default",
	Icon: Wrench,
};

const TOOL_ICON_MAP: Record<string, ActionIconDefinition> = {
	searchKnowledgeBase: {
		key: "searchKnowledgeBase",
		Icon: Search,
	},
	updateConversationTitle: {
		key: "updateConversationTitle",
		Icon: Heading,
	},
	setConversationTitle: {
		key: "updateConversationTitle",
		Icon: Heading,
	},
	updateSentiment: {
		key: "updateSentiment",
		Icon: Bot,
	},
	setPriority: {
		key: "setPriority",
		Icon: Flag,
	},
	categorizeConversation: {
		key: "categorizeConversation",
		Icon: Tag,
	},
	aiCreditUsage: {
		key: "aiCreditUsage",
		Icon: DollarSign,
	},
	generationUsage: {
		key: "aiCreditUsage",
		Icon: DollarSign,
	},
	aiThinkingTrace: {
		key: "aiThinkingTrace",
		Icon: Brain,
	},
};

const DEFAULT_EVENT_ICON: ActionIconDefinition = {
	key: "default",
	Icon: CircleDot,
};

const EVENT_ICON_MAP: Partial<
	Record<TimelinePartEvent["eventType"], ActionIconDefinition>
> = {
	assigned: {
		key: "assigned",
		Icon: UserCheck,
	},
	unassigned: {
		key: "unassigned",
		Icon: UserMinus,
	},
	participant_requested: {
		key: "participant_requested",
		Icon: Users,
	},
	participant_joined: {
		key: "participant_joined",
		Icon: UserPlus,
	},
	participant_left: {
		key: "participant_left",
		Icon: UserMinus,
	},
	status_changed: {
		key: "status_changed",
		Icon: CircleDot,
	},
	priority_changed: {
		key: "priority_changed",
		Icon: Flag,
	},
	tag_added: {
		key: "tag_added",
		Icon: Tag,
	},
	tag_removed: {
		key: "tag_removed",
		Icon: Tag,
	},
	resolved: {
		key: "resolved",
		Icon: CircleCheck,
	},
	reopened: {
		key: "reopened",
		Icon: RotateCcw,
	},
	visitor_blocked: {
		key: "visitor_blocked",
		Icon: ShieldX,
	},
	visitor_unblocked: {
		key: "visitor_unblocked",
		Icon: ShieldCheck,
	},
	visitor_identified: {
		key: "visitor_identified",
		Icon: UserCheck,
	},
	ai_paused: {
		key: "ai_paused",
		Icon: Pause,
	},
	ai_resumed: {
		key: "ai_resumed",
		Icon: Play,
	},
};

export function getToolActionIconDefinition(
	toolName: string | null | undefined
): ActionIconDefinition {
	if (!toolName) {
		return DEFAULT_TOOL_ICON;
	}

	return TOOL_ICON_MAP[toolName] ?? DEFAULT_TOOL_ICON;
}

export function getEventActionIconDefinition(
	eventType: TimelinePartEvent["eventType"] | string | null | undefined
): ActionIconDefinition {
	if (!eventType) {
		return DEFAULT_EVENT_ICON;
	}

	return (
		EVENT_ICON_MAP[eventType as TimelinePartEvent["eventType"]] ??
		DEFAULT_EVENT_ICON
	);
}

export function resolveToolActivityIcon(
	toolName: string | null | undefined
): ActivityIcon {
	const { Icon, key } = getToolActionIconDefinition(toolName);
	return {
		type: "icon",
		Icon,
		iconKey: key,
	};
}

export function renderToolActionIcon(
	toolName: string | null | undefined,
	className?: string
) {
	const { Icon, key } = getToolActionIconDefinition(toolName);
	return (
		<Icon
			aria-hidden
			className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
			data-tool-action-icon={key}
		/>
	);
}

export function renderEventActionIcon(
	eventType: TimelinePartEvent["eventType"] | string | null | undefined,
	className?: string
) {
	const { Icon, key } = getEventActionIconDefinition(eventType);
	return (
		<Icon
			aria-hidden
			className={cn("size-3.5 shrink-0 text-muted-foreground", className)}
			data-event-action-icon={key}
		/>
	);
}
