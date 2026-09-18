import { isPolarEnabled } from "@api/lib/billing-mode";
import polarClient from "@api/lib/polar";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { ensureWebsiteAccess } from "@/lib/auth/website-access";

type BillingPageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function BillingPage({ params }: BillingPageProps) {
	const { websiteSlug } = await params;
	const { website } = await ensureWebsiteAccess(websiteSlug);

	if (!website) {
		redirect("/select");
	}

	if (!isPolarEnabled()) {
		return (
			<SettingsPage className="py-30">
				<SettingsHeader>Billing</SettingsHeader>
				<SettingsRow
					description="This deployment is running in self-hosted mode with Polar disabled, so billing, credit tracking, and upgrade flows are bypassed."
					title="Billing Disabled"
				>
					<div className="flex items-center justify-between gap-4 p-4">
						<p className="max-w-xl text-primary/70 text-sm">
							There is no customer portal for this deployment because
							subscription management is turned off.
						</p>
						<Button asChild variant="outline">
							<Link href={`/${websiteSlug}/settings/plan`}>Back to plan</Link>
						</Button>
					</div>
				</SettingsRow>
			</SettingsPage>
		);
	}

	const customer = await polarClient.customers.getExternal(
		website.organizationId
	);

	if (!customer) {
		redirect("/select");
	}

	const customerPortal = await polarClient.customerSessions.create({
		customer_id: customer.id,
	});

	redirect(customerPortal.customer_portal_url);
}
