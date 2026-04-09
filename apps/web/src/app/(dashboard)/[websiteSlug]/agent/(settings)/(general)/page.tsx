import { prefetchAgentGeneralPageData } from "../../_lib/prefetch";
import GeneralSettingsPage from "../general-settings-page";

type PageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function Page({ params }: PageProps) {
	const { websiteSlug } = await params;

	await prefetchAgentGeneralPageData(websiteSlug);

	return <GeneralSettingsPage />;
}
