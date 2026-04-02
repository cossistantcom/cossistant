import { ConversationTimelineType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";

type PreparedMessageDefaultTimelineItem = {
	kind: "message";
	input: {
		id?: string;
		text: string;
		extraParts: unknown[];
		visibility: TimelineItem["visibility"] | undefined;
		userId: string | null;
		aiAgentId: string | null;
		visitorId: string | null;
		createdAt: Date | undefined;
		tool: string | null;
	};
};

type PreparedGenericDefaultTimelineItem = {
	kind: "timeline";
	input: {
		id?: string;
		type: TimelineItem["type"];
		text: string | null;
		parts: TimelineItem["parts"];
		visibility: TimelineItem["visibility"] | undefined;
		userId: string | null;
		aiAgentId: string | null;
		visitorId: string | null;
		createdAt: Date | undefined;
		tool: string | null;
	};
};

export type PreparedDefaultTimelineItem =
	| PreparedMessageDefaultTimelineItem
	| PreparedGenericDefaultTimelineItem;

export function mapDefaultTimelineItemForCreation(
	item: TimelineItem
): PreparedDefaultTimelineItem {
	const createdAt = item.createdAt ? new Date(item.createdAt) : undefined;
	const normalizedType = item.type ?? ConversationTimelineType.MESSAGE;

	if (normalizedType === ConversationTimelineType.MESSAGE) {
		return {
			kind: "message",
			input: {
				id: item.id,
				text: item.text ?? "",
				extraParts: item.parts?.filter((part) => part.type !== "text") ?? [],
				visibility: item.visibility,
				userId: item.userId ?? null,
				aiAgentId: item.aiAgentId ?? null,
				visitorId: item.visitorId ?? null,
				createdAt,
				tool: item.tool ?? null,
			},
		};
	}

	return {
		kind: "timeline",
		input: {
			id: item.id,
			type: normalizedType,
			text: item.text ?? null,
			parts: item.parts ?? [],
			visibility: item.visibility,
			userId: item.userId ?? null,
			aiAgentId: item.aiAgentId ?? null,
			visitorId: item.visitorId ?? null,
			createdAt,
			tool: item.tool ?? null,
		},
	};
}
