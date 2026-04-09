"use client";

import type { AiAgentResponse } from "@cossistant/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentOnboardingFlow } from "./agent-onboarding-flow";

type CreatePageProps = {
	existingAgent: AiAgentResponse | null;
};

export default function CreatePage({ existingAgent }: CreatePageProps) {
	return (
		<ScrollArea className="h-screen w-full" orientation="vertical" scrollMask>
			<AgentOnboardingFlow existingAgent={existingAgent} />
		</ScrollArea>
	);
}
