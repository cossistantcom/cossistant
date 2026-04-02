import type { TypingEntry } from "@plasma/core";
import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import type { SupportTextResolvedFormatter } from "../../support/text/locales/keys";
import { resolveSupportHumanAgentDisplay } from "../../support/utils/human-agent-display";

export type TimelineTypingParticipant = {
	id: string;
	type: "team_member" | "ai";
};

export type PreviewTypingParticipant = TimelineTypingParticipant & {
	name: string;
	image: string | null;
};

export type MapTypingEntriesToPreviewParticipantsOptions = {
	availableHumanAgents: AvailableHumanAgent[];
	availableAIAgents: AvailableAIAgent[];
	text: SupportTextResolvedFormatter;
};

export function isWidgetVisibleTypingEntry(entry: {
	actorType?: string | null;
}): boolean {
	return entry.actorType === "user";
}

export function filterWidgetVisibleTypingEntries<T extends TypingEntry>(
	entries: readonly T[]
): T[] {
	return entries.filter((entry) => isWidgetVisibleTypingEntry(entry));
}

export function isWidgetVisibleTypingParticipant(
	participant: Pick<TimelineTypingParticipant, "type">
): boolean {
	return participant.type === "team_member";
}

export function filterWidgetVisibleTypingParticipants<
	T extends TimelineTypingParticipant,
>(participants: readonly T[]): T[] {
	return participants.filter((participant) =>
		isWidgetVisibleTypingParticipant(participant)
	);
}

/**
 * Converts raw typing events into participants understood by the timeline
 * renderer.
 */
export function mapTypingEntriesToParticipants(
	entries: TypingEntry[]
): TimelineTypingParticipant[] {
	return entries
		.map<TimelineTypingParticipant | null>((entry) => {
			if (entry.actorType === "user") {
				return {
					id: entry.actorId,
					type: "team_member",
				};
			}

			if (entry.actorType === "ai_agent") {
				return {
					id: entry.actorId,
					type: "ai",
				};
			}

			return null;
		})
		.filter(
			(participant): participant is TimelineTypingParticipant =>
				participant !== null
		);
}

/**
 * Resolves typing events into fully hydrated preview participants with display
 * names and avatars ready for UI consumption.
 */
export function mapTypingEntriesToPreviewParticipants(
	entries: TypingEntry[],
	{
		availableHumanAgents,
		availableAIAgents,
		text,
	}: MapTypingEntriesToPreviewParticipantsOptions
): PreviewTypingParticipant[] {
	return entries
		.map<PreviewTypingParticipant | null>((entry) => {
			if (entry.actorType === "user") {
				const human = availableHumanAgents.find(
					(agent) => agent.id === entry.actorId
				);
				const humanDisplay = resolveSupportHumanAgentDisplay(
					human,
					text("common.fallbacks.supportTeam")
				);

				return {
					id: entry.actorId,
					type: "team_member",
					name: humanDisplay.displayName,
					image: human?.image ?? null,
				};
			}

			if (entry.actorType === "ai_agent") {
				const ai = availableAIAgents.find(
					(agent) => agent.id === entry.actorId
				);

				return {
					id: entry.actorId,
					type: "ai",
					name: ai?.name || text("common.fallbacks.aiAssistant"),
					image: ai?.image ?? null,
				};
			}

			return null;
		})
		.filter(
			(participant): participant is PreviewTypingParticipant =>
				participant !== null
		);
}
