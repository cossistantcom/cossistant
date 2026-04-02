import Link from "next/link";
import { UsageBar } from "@/components/plan/usage-bar";
import { Button } from "@/components/ui/button";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { ensureWebsiteAccess } from "@/lib/auth/website-access";
import { getPlanPricing } from "@/lib/plan-pricing";
import { getQueryClient, prefetch, trpc } from "@/lib/trpc/server";
import { getAiCreditUsageView } from "./ai-credit-usage";
import { PlanPageClient } from "./plan-page-client";
import { UpgradeButton } from "./upgrade-button";

function formatRollingWindowUsage(
	current: number,
	limit: number | null
): string {
	if (limit === null) {
		return `${current.toLocaleString()} / Unlimited (rolling 30 days)`;
	}

	return `${current.toLocaleString()} / ${limit.toLocaleString()} (rolling 30 days)`;
}

type UsageSettingsPageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
	searchParams: Promise<{
		checkout_success?: string;
		checkout_error?: string;
	}>;
};

export default async function UsageSettingsPage({
	params,
	searchParams,
}: UsageSettingsPageProps) {
	const { websiteSlug } = await params;
	const { checkout_success, checkout_error } = await searchParams;

	await ensureWebsiteAccess(websiteSlug);

	// Prefetch plan info
	await prefetch(trpc.plan.getPlanInfo.queryOptions({ websiteSlug }), () => {
		// Handle error if needed
	});

	return (
		<>
			<PlanPageClient
				checkoutError={checkout_error === "true"}
				checkoutSuccess={checkout_success === "true"}
				websiteSlug={websiteSlug}
			/>
			<SettingsPage className="py-30">
				<SettingsHeader>Plan & Usage</SettingsHeader>

				<PlanInfoContent websiteSlug={websiteSlug} />
			</SettingsPage>
		</>
	);
}

async function PlanInfoContent({ websiteSlug }: { websiteSlug: string }) {
	const queryClient = getQueryClient();
	const planInfo = await queryClient.fetchQuery(
		trpc.plan.getPlanInfo.queryOptions({ websiteSlug })
	);

	const { plan, usage, aiCredits } = planInfo;
	const aiCreditUsage = getAiCreditUsageView(aiCredits);
	const pricing = getPlanPricing(plan.name);
	const effectiveMonthlyPrice =
		typeof plan.price === "number" ? plan.price : pricing.price;
	const displayedPrice = pricing.hasPromo
		? pricing.promoPrice
		: effectiveMonthlyPrice;
	const planPriceDescription =
		typeof displayedPrice === "number"
			? pricing.hasPromo && typeof pricing.price === "number"
				? ` ($${displayedPrice}/month, normally $${pricing.price})`
				: ` ($${displayedPrice}/month)`
			: "";

	return (
		<>
			<SettingsRow
				description={`You are currently on the ${plan.displayName} plan${planPriceDescription}.`}
				title="Current Plan"
			>
				<div className="flex flex-wrap items-center justify-between gap-4 p-2 pl-4">
					{plan.name === "free" && (
						<div className="flex gap-2 text-plasma-orange">
							<p className="py-2 text-sm">
								Early bird launch pricing is live. Upgrade now to lock in
								discounted rates for the lifetime of your subscription.
							</p>
						</div>
					)}
					<div className="flex items-center gap-2">
						<span className="font-medium text-lg">{plan.displayName}</span>
						{pricing.hasPromo && typeof pricing.promoPrice === "number" ? (
							<div className="flex items-baseline gap-2 text-sm">
								<span className="font-semibold text-plasma-orange">
									${pricing.promoPrice}
								</span>
								{typeof pricing.price === "number" && (
									<span className="text-primary/40 text-xs line-through">
										${pricing.price}
									</span>
								)}
								<span className="text-primary/60 text-xs">/month</span>
							</div>
						) : typeof displayedPrice === "number" ? (
							<span className="text-primary/60 text-sm">
								${displayedPrice}/month
							</span>
						) : (
							<span className="text-primary/60 text-sm">Free</span>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<UpgradeButton planInfo={planInfo} websiteSlug={websiteSlug} />
						<Button asChild variant="outline">
							<Link href={`/${websiteSlug}/billing`}>View billing</Link>
						</Button>
					</div>
				</div>
			</SettingsRow>

			<SettingsRow
				description="Track your usage against plan limits"
				title="Usage & Limits"
			>
				<div className="space-y-6 p-4">
					{aiCreditUsage && (
						<UsageBar
							current={aiCreditUsage.current}
							formatValue={() => aiCreditUsage.usageLabel}
							label="AI Credits (Current Billing Cycle)"
							limit={aiCreditUsage.limit}
						/>
					)}

					{/* Contacts */}
					<UsageBar
						current={usage.contacts}
						label="Contacts"
						limit={plan.features.contacts}
					/>

					{/* Team Members */}
					<UsageBar
						current={Math.max(1, usage.teamMembers)}
						formatValue={(current, limit) => {
							const othersCount = Math.max(0, current - 1);
							const displayText = othersCount === 0 ? "Alone" : othersCount + 1;

							if (limit === null) {
								return `${displayText} / Unlimited`;
							}

							return `${displayText} / ${limit.toLocaleString()}`;
						}}
						label="Team Members"
						limit={plan.features["team-members"]}
					/>

					{/* Conversations */}
					<UsageBar
						current={usage.conversations}
						formatValue={formatRollingWindowUsage}
						label="Conversations"
						limit={plan.features.conversations}
					/>

					{/* Messages */}
					<UsageBar
						current={usage.messages}
						formatValue={formatRollingWindowUsage}
						label="Messages"
						limit={plan.features.messages}
					/>

					{/* Conversation Retention - at the bottom */}
					<UsageBar
						current={
							typeof plan.features["conversation-retention"] === "number"
								? plan.features["conversation-retention"]
								: 0
						}
						formatValue={(current, limit) => {
							if (limit === null && current === 0) {
								return "Unlimited";
							}
							return `Auto delete after ${current} days`;
						}}
						label="Data retention"
						limit={null}
						showBar={false}
					/>
				</div>
			</SettingsRow>
		</>
	);
}
