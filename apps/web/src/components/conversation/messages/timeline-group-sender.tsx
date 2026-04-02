import type { RouterOutputs } from "@api/trpc/types";
import type { AvailableAIAgent } from "@plasma/types";
import { SenderType } from "@plasma/types";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import type { ConversationHeader } from "@/contexts/inboxes";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { getVisitorNameWithFallback } from "@/lib/visitors";

type ResolveDashboardTimelineSenderParams = {
	senderId: string;
	senderType: SenderType;
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	availableAIAgents: AvailableAIAgent[];
	visitor: ConversationHeader["visitor"];
};

export function resolveDashboardTimelineSender(
	params: ResolveDashboardTimelineSenderParams
) {
	const { senderId, senderType, teamMembers, availableAIAgents, visitor } =
		params;
	const humanAgent = teamMembers.find((agent) => agent.id === senderId);
	const humanDisplay =
		senderType === SenderType.TEAM_MEMBER
			? resolveDashboardHumanAgentDisplay({
					id: humanAgent?.id ?? senderId ?? "unknown-member",
					name: humanAgent?.name ?? null,
				})
			: null;
	const aiAgent = availableAIAgents.find((agent) => agent.id === senderId);
	const visitorName = getVisitorNameWithFallback(visitor);
	const senderDisplayName =
		senderType === SenderType.VISITOR
			? visitorName
			: senderType === SenderType.AI
				? aiAgent?.name || "AI Assistant"
				: (humanDisplay?.displayName ?? "Team member");

	return {
		aiAgent,
		humanAgent,
		humanDisplay,
		senderDisplayName,
		visitorName,
	};
}

export function TimelineGroupSenderAvatar({
	senderId,
	senderType,
	teamMembers,
	availableAIAgents,
	visitor,
}: ResolveDashboardTimelineSenderParams) {
	const { aiAgent, humanAgent, humanDisplay, visitorName } =
		resolveDashboardTimelineSender({
			senderId,
			senderType,
			teamMembers,
			availableAIAgents,
			visitor,
		});

	if (senderType === SenderType.VISITOR) {
		return (
			<Avatar
				className="size-6"
				fallbackName={visitorName}
				url={visitor?.contact?.image}
			/>
		);
	}

	if (senderType === SenderType.AI) {
		return (
			<div className="flex size-6 shrink-0 items-center justify-center">
				<Logo className="size-5 text-primary/90" />
			</div>
		);
	}

	return (
		<Avatar
			className="size-6"
			facehashSeed={humanDisplay?.facehashSeed}
			fallbackName={humanDisplay?.displayName ?? "Team member"}
			url={humanAgent?.image}
		/>
	);
}
