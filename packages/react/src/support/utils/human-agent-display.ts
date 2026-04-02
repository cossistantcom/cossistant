import { resolveHumanAgentDisplay } from "@plasma/core";
import type { AvailableHumanAgent } from "@plasma/types";

export function resolveSupportHumanAgentDisplay(
	agent: Pick<AvailableHumanAgent, "id" | "name"> | null | undefined,
	fallbackLabel: string
) {
	return resolveHumanAgentDisplay(
		{
			id: agent?.id ?? fallbackLabel,
			name: agent?.name ?? null,
		},
		{
			surface: "public",
			publicFallbackLabel: fallbackLabel,
		}
	);
}
