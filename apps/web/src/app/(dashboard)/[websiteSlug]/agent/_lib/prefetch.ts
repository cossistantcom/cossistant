import "server-only";

import { redirect } from "next/navigation";
import { ensureWebsiteAccess } from "@/lib/auth/website-access";
import { getQueryClient, prefetch, trpc } from "@/lib/trpc/server";

async function fetchAiAgent(websiteSlug: string) {
	const queryClient = getQueryClient();

	return await queryClient.fetchQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug,
		})
	);
}

export async function prefetchAgentShell(websiteSlug: string) {
	await ensureWebsiteAccess(websiteSlug);

	const aiAgentPromise = fetchAiAgent(websiteSlug);

	await Promise.all([
		aiAgentPromise,
		prefetch(
			trpc.plan.getPlanInfo.queryOptions({
				websiteSlug,
			})
		),
	]);

	const aiAgent = await aiAgentPromise;

	return { aiAgent };
}

export async function requireCompletedAgent(websiteSlug: string) {
	const { aiAgent } = await prefetchAgentShell(websiteSlug);

	if (!aiAgent?.onboardingCompletedAt) {
		redirect(`/${websiteSlug}/agent/create`);
	}

	return aiAgent;
}

export async function prefetchAgentGeneralPageData(websiteSlug: string) {
	await requireCompletedAgent(websiteSlug);

	await prefetch(
		trpc.aiAgent.getBehaviorSettings.queryOptions({
			websiteSlug,
		})
	);
}

export async function prefetchAgentBehaviorPageData(websiteSlug: string) {
	const aiAgent = await requireCompletedAgent(websiteSlug);

	await prefetch(
		trpc.aiAgent.getPromptStudio.queryOptions({
			websiteSlug,
			aiAgentId: aiAgent.id,
		})
	);
}

export async function prefetchAgentToolsPageData(websiteSlug: string) {
	const aiAgent = await requireCompletedAgent(websiteSlug);

	await prefetch(
		trpc.aiAgent.getCapabilitiesStudio.queryOptions({
			websiteSlug,
			aiAgentId: aiAgent.id,
		})
	);
}

export async function prefetchAgentOnboardingPageData(websiteSlug: string) {
	const { aiAgent } = await prefetchAgentShell(websiteSlug);

	if (aiAgent?.onboardingCompletedAt) {
		redirect(`/${websiteSlug}/agent`);
	}

	await prefetch(
		trpc.linkSource.getTrainingStats.queryOptions({
			websiteSlug,
		})
	);

	return { aiAgent };
}
