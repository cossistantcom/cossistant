import { resolveHumanAgentDisplay } from "@plasma/core";

export const DASHBOARD_TEAM_MEMBER_FALLBACK = "Team member";

export function resolveDashboardHumanAgentDisplay(agent: {
	id: string;
	name?: string | null;
}) {
	return resolveHumanAgentDisplay(
		{
			id: agent.id,
			name: agent.name ?? null,
		},
		{
			surface: "internal",
			internalFallbackLabel: DASHBOARD_TEAM_MEMBER_FALLBACK,
		}
	);
}
