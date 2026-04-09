import { prefetchAgentOnboardingPageData } from "../../_lib/prefetch";
import CreatePage from "./create-page";

type PageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function Page({ params }: PageProps) {
	const { websiteSlug } = await params;
	const { aiAgent } = await prefetchAgentOnboardingPageData(websiteSlug);

	return <CreatePage existingAgent={aiAgent} />;
}
