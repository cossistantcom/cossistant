import { getPlanForWebsite } from "@api/lib/plans/access";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { ensureWebsiteAccess } from "@/lib/auth/website-access";
import { AllowedDomainsForm } from "./allowed-domains-form";
import { ApiKeysSection } from "./api-keys-section";
import { OpenRouterByokSection } from "./openrouter-byok-section";

type DevelopersSettingsPageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function DevelopersSettingsPage({
	params,
}: DevelopersSettingsPageProps) {
	const { websiteSlug } = await params;

	const { website } = await ensureWebsiteAccess(websiteSlug);
	const planInfo = await getPlanForWebsite(website);

	return (
		<SettingsPage>
			<SettingsHeader>Developers</SettingsHeader>
			<PageContent className="py-30">
				<SettingsRow
					description="Create, review, and revoke the API keys connected to this website."
					title="Public and private API keys"
				>
					<ApiKeysSection
						organizationId={website.organizationId}
						websiteId={website.id}
						websiteName={website.name}
						websiteSlug={website.slug}
					/>
				</SettingsRow>

				<SettingsRow
					description="Use a customer-owned OpenRouter API key for AI calls on this website."
					title="OpenRouter key"
				>
					<OpenRouterByokSection
						currentPlan={{
							name: planInfo.planName,
							displayName: planInfo.displayName,
							price: planInfo.price,
							features: planInfo.features,
						}}
						organizationId={website.organizationId}
						websiteId={website.id}
						websiteSlug={website.slug}
					/>
				</SettingsRow>

				<SettingsRow
					description="Manage the allowlist of domains and subdomains that can use your public keys."
					title="Allowed domains"
				>
					<AllowedDomainsForm
						initialDomains={website.whitelistedDomains}
						organizationId={website.organizationId}
						websiteId={website.id}
						websiteSlug={website.slug}
					/>
				</SettingsRow>
			</PageContent>
		</SettingsPage>
	);
}
