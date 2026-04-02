import {
	FEATURE_CONFIG,
	type FeatureCategory,
	type FeatureKey,
	type FeatureValue,
	PLAN_CONFIG,
} from "@api/lib/plans/config";
import { Check, Info, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLdScripts } from "@/components/seo/json-ld";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TooltipOnHover } from "@/components/ui/tooltip";
import {
	buildOrganizationJsonLd,
	buildSoftwareApplicationJsonLd,
	marketing,
} from "@/lib/metadata";
import { PromoBannerOrnaments } from "./promo-banner-ornaments";
import { PromoIndicator } from "./promo-indicator";

export const metadata = marketing({
	title: "Pricing",
	description: "Simple, transparent pricing for your customer support needs.",
	path: "/pricing",
	keywords: [
		"Cossistant pricing",
		"support widget pricing",
		"AI support pricing",
	],
});

const FeatureHeader = ({ featureKey }: { featureKey: FeatureKey }) => {
	const featureConfig = FEATURE_CONFIG[featureKey];
	const displayName = featureConfig.name;
	const description = featureConfig.description;

	return (
		<li className="z-0 flex h-12 items-center gap-2 border-b border-dashed px-6 last-of-type:border-transparent">
			<TooltipOnHover content={description}>
				<button
					className="group flex items-center gap-1.5 text-primary transition-colors hover:text-primary/80"
					type="button"
				>
					<span className="border-primary/30 border-b border-dashed group-hover:border-primary/50">
						{displayName}
					</span>
					<Info className="size-3 opacity-50 group-hover:opacity-70" />
				</button>
			</TooltipOnHover>
		</li>
	);
};

const FeatureCell = ({
	featureKey,
	value,
}: {
	featureKey: FeatureKey;
	value: FeatureValue;
}) => {
	const featureConfig = FEATURE_CONFIG[featureKey];
	const displayName = featureConfig.name;
	const isComingSoon = featureConfig.comingSoon;
	const unit = featureConfig.unit;

	// Determine what to display based on the value type
	let displayValue: ReactNode;
	let icon: ReactNode;

	if (typeof value === "boolean") {
		// Boolean features show check/x
		icon = value ? (
			<Check className="h-4 w-4 text-primary" />
		) : (
			<X className="h-4 w-4 text-muted-foreground" />
		);
		displayValue = null;
	} else if (typeof value === "number") {
		// Numeric features show the number with unit
		icon = <Check className="h-4 w-4 text-primary" />;

		// Format the value based on the unit
		if (unit) {
			// Special formatting for certain units
			if (unit === "days") {
				displayValue = `${value} ${unit}`;
			} else if (unit === "MB") {
				displayValue = `${value} MB`;
			} else if (unit === "MB per AI agent") {
				displayValue = `${value} MB per agent`;
			} else if (unit === "seats") {
				displayValue = value === 1 ? `${value} seat` : `${value} seats`;
			} else if (unit === "agents") {
				displayValue = value === 1 ? `${value} agent` : `${value} agents`;
			} else if (unit === "links") {
				displayValue = `${value} links`;
			} else if (unit === "per month" || unit === "per rolling 30 days") {
				// Format large numbers with commas for rolling-window limits
				const formattedValue = value.toLocaleString();
				displayValue = `${formattedValue} / rolling 30 days`;
			} else if (unit === "credits per month") {
				// Format AI credits with commas
				const formattedValue = value.toLocaleString();
				displayValue = `${formattedValue} credits/mo`;
			} else {
				displayValue = `${value} ${unit}`;
			}
		} else {
			displayValue = value.toLocaleString();
		}
	} else if (value === null) {
		// Null means unlimited
		icon = <Check className="h-4 w-4 text-primary" />;
		displayValue = "Unlimited";
	}

	return (
		<li className="flex h-12 items-center gap-2 border-b border-dashed px-6 last-of-type:border-transparent">
			{icon}

			<span className="flex w-full items-center justify-between gap-2 pl-2 text-primary">
				<span className="flex-1 text-primary xl:hidden">
					{displayName}{" "}
					{isComingSoon && (
						<Badge className="ml-2 text-xs opacity-45" variant="secondary">
							Soon
						</Badge>
					)}
				</span>

				{displayValue && <span className="text-primary">{displayValue}</span>}
				{isComingSoon && (
					<Badge
						className="ml-auto hidden text-xs opacity-45 xl:block"
						variant="secondary"
					>
						Soon
					</Badge>
				)}
			</span>
		</li>
	);
};

export default function PricingPage() {
	const plans = [PLAN_CONFIG.free, PLAN_CONFIG.hobby, PLAN_CONFIG.pro];
	const hiddenPricingFeatures = new Set<FeatureKey>(["ai-support-agents"]);

	// Group features by category
	const groupFeaturesByCategory = (
		features: Record<FeatureKey, FeatureValue>
	) => {
		const primary: [FeatureKey, FeatureValue][] = [];
		const secondary: [FeatureKey, FeatureValue][] = [];

		for (const [key, value] of Object.entries(features)) {
			if (hiddenPricingFeatures.has(key as FeatureKey)) {
				continue;
			}
			const featureConfig = FEATURE_CONFIG[key as FeatureKey];
			if (featureConfig.category === "primary") {
				primary.push([key as FeatureKey, value]);
			} else {
				secondary.push([key as FeatureKey, value]);
			}
		}

		return { primary, secondary };
	};

	return (
		<div className="flex flex-col pt-40">
			<JsonLdScripts
				data={[
					buildOrganizationJsonLd(),
					buildSoftwareApplicationJsonLd({
						title: "Cossistant Pricing",
						description:
							"Simple, transparent pricing for the Cossistant AI and human support framework.",
						path: "/pricing",
					}),
				]}
				idPrefix="pricing-jsonld"
			/>
			<div className="mx-auto max-w-2xl text-center">
				<h1 className="font-f37-stout text-4xl leading-tight md:text-6xl">
					Pricing
				</h1>
				<h2 className="mt-4 text-lg text-muted-foreground">
					Integrate for free and scale as you grow.
				</h2>
			</div>

			{/* Launch Promotion Banner */}
			{(PLAN_CONFIG.hobby.priceWithPromo || PLAN_CONFIG.pro.priceWithPromo) && (
				<div className="relative mx-auto mt-10 max-w-4xl px-2 py-1 text-center">
					<PromoBannerOrnaments>
						<div className="flex flex-col items-center justify-center gap-2 py-2">
							<h3 className="flex items-center gap-2 text-plasma-orange text-sm">
								Limited launch offer – up to{" "}
								<span className="font-bold text-plasma-orange">
									{Math.max(
										PLAN_CONFIG.hobby.priceWithPromo && PLAN_CONFIG.hobby.price
											? Math.round(
													((PLAN_CONFIG.hobby.price -
														PLAN_CONFIG.hobby.priceWithPromo) /
														PLAN_CONFIG.hobby.price) *
														100
												)
											: 0,
										PLAN_CONFIG.pro.priceWithPromo && PLAN_CONFIG.pro.price
											? Math.round(
													((PLAN_CONFIG.pro.price -
														PLAN_CONFIG.pro.priceWithPromo) /
														PLAN_CONFIG.pro.price) *
														100
												)
											: 0
									)}
									% off
								</span>{" "}
								lifetime while subscribed
							</h3>
						</div>
					</PromoBannerOrnaments>
				</div>
			)}

			{/* Pricing Cards */}
			<div className="mt-14 grid grid-cols-1 border-y border-dashed xl:grid-cols-4">
				<div className="hidden flex-col border-r border-dashed last-of-type:border-r-0 xl:flex">
					<div className="sticky top-14 z-1 h-[233px] w-full border-b border-dashed bg-background" />
					<div className="flex-1 pt-0">
						{(() => {
							const { primary, secondary } = groupFeaturesByCategory(
								PLAN_CONFIG.free.features
							);

							return (
								<>
									{/* Primary Features */}
									<ul>
										{primary.map(([key, value]) => (
											<FeatureHeader featureKey={key} key={key} />
										))}
									</ul>

									{/* Secondary Features */}
									{secondary.length > 0 && (
										<>
											<div className="mt-16 px-6 py-2">
												<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
													Advanced Features
												</span>
											</div>
											<ul>
												{secondary.map(([key, value]) => (
													<FeatureHeader featureKey={key} key={key} />
												))}
											</ul>
										</>
									)}
								</>
							);
						})()}
					</div>
				</div>
				{plans.map((plan) => (
					<div
						className="flex flex-col border-b border-dashed last-of-type:border-r-0 xl:border-r xl:border-b-0"
						key={plan.name}
					>
						<div className="sticky top-14 z-10 flex flex-col space-y-1.5 border-b border-dashed bg-background p-6">
							<div className="flex items-center gap-2">
								<h3 className="font-medium text-2xl leading-none tracking-tight">
									{plan.displayName}
								</h3>
								{plan.priceWithPromo && plan.price !== plan.priceWithPromo && (
									<PromoIndicator
										price={plan.price}
										promoPrice={plan.priceWithPromo}
									/>
								)}
								{plan.isRecommended && (
									<p className="z-0 font-medium text-plasma-orange text-xs">
										Recommended
									</p>
								)}
							</div>
							<p className="h-18 text-muted-foreground text-sm">
								{plan.name === "free"
									? "Perfect for getting started"
									: plan.name === "hobby"
										? "For growing teams"
										: "For teams with advanced needs"}
							</p>
							<div className="mt-10">
								{plan.priceWithPromo && plan.price !== plan.priceWithPromo ? (
									<div className="flex items-baseline gap-2">
										<span className="font-f37-stout font-semibold text-3xl text-plasma-orange underline decoration-1 underline-offset-3">
											${plan.priceWithPromo}
										</span>
										<span className="relative font-f37-stout text-base text-muted-foreground line-through decoration-1 decoration-plasma-orange">
											${plan.price}
										</span>
										<span className="text-muted-foreground text-sm">
											/month
										</span>
									</div>
								) : (
									<>
										<span className="font-f37-stout font-semibold text-3xl">
											${plan.price ?? 0}
										</span>
										<span className="text-muted-foreground text-sm">
											/month
										</span>
									</>
								)}
							</div>
						</div>
						<div className="flex-1 pt-0">
							{(() => {
								const { primary, secondary } = groupFeaturesByCategory(
									plan.features
								);
								return (
									<>
										{/* Primary Features */}
										<ul>
											{primary.map(([key, value]) => (
												<FeatureCell featureKey={key} key={key} value={value} />
											))}
										</ul>

										{/* Secondary Features */}
										{secondary.length > 0 && (
											<>
												<div className="mt-16 px-6 py-2">
													<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
														Advanced Features
													</span>
												</div>
												<ul>
													{secondary.map(([key, value]) => (
														<FeatureCell
															featureKey={key}
															key={key}
															value={value}
														/>
													))}
												</ul>
											</>
										)}
									</>
								);
							})()}
						</div>
						<div className="flex items-center px-6 pt-10 pb-6">
							<Button asChild className="w-full" variant="outline">
								<Link
									href={
										plan.name === "free"
											? "/sign-up"
											: `/sign-up?plan=${plan.name}`
									}
								>
									Get started
								</Link>
							</Button>
						</div>
					</div>
				))}
			</div>

			{/* FAQ Section */}
			<div className="mx-auto mt-24 w-full px-6">
				<h2 className="mb-8 font-bold font-f37-stout text-3xl">
					Frequently Asked Questions
				</h2>
				<Accordion className="w-full" collapsible type="single">
					<AccordionItem value="item-1">
						<AccordionTrigger>Can I self-host Cossistant?</AccordionTrigger>
						<AccordionContent>
							Yes! Cossistant is open source. You can self-host it on your own
							infrastructure. Check out our{" "}
							<Link
								className="text-primary underline"
								href="https://github.com/plasma-pandora/plasma-pandora"
							>
								GitHub repository
							</Link>{" "}
							for instructions.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-oss">
						<AccordionTrigger>
							Do you offer anything for open source projects?
						</AccordionTrigger>
						<AccordionContent>
							Yes. If you run an eligible open source project, you can apply to
							our{" "}
							<Link
								className="text-primary underline"
								href="/open-source-program"
							>
								Open Source Program
							</Link>{" "}
							to get Cossistant Pro for free.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-2">
						<AccordionTrigger>Do you offer annual billing?</AccordionTrigger>
						<AccordionContent>
							We currently offer monthly billing only. Annual plans may be
							available in the future.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-3">
						<AccordionTrigger>
							How long does the launch promo pricing apply?
						</AccordionTrigger>
						<AccordionContent>
							The promotional pricing applies for the lifetime of your
							subscription. If you cancel, you'll lose the promo rate and
							re-subscribing will use the then-current pricing.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-4">
						<AccordionTrigger>When do my usage limits reset?</AccordionTrigger>
						<AccordionContent>
							Message and conversation limits use a rolling 30-day window. At
							any moment, we count usage from the last 30 days.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-5">
						<AccordionTrigger>
							What happens if I exceed my limits?
						</AccordionTrigger>
						<AccordionContent>
							We'll notify you when approaching limits. For workflows and AI
							credits, you can continue with usage-based billing. For other
							limits, please upgrade your plan or{" "}
							<Link
								className="text-primary underline"
								href="mailto:support@plasma-pandora.com"
							>
								contact us
							</Link>
							.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-6">
						<AccordionTrigger>
							Can I buy add-ons or enable whitelabelling?
						</AccordionTrigger>
						<AccordionContent>
							Add-ons for increased limits and full whitelabelling are coming
							soon.{" "}
							<Link
								className="text-primary underline"
								href="mailto:support@plasma-pandora.com"
							>
								Contact us
							</Link>{" "}
							to join the waitlist or discuss your needs.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-7">
						<AccordionTrigger>
							When will "coming soon" features be available?
						</AccordionTrigger>
						<AccordionContent>
							We ship fast but have no specific ETA yet.{" "}
							<Link
								className="text-primary underline"
								href="mailto:support@plasma-pandora.com"
							>
								Contact us
							</Link>{" "}
							if you need a particular feature prioritized for your use case.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-8">
						<AccordionTrigger>How do AI credits work?</AccordionTrigger>
						<AccordionContent>
							AI credits reset monthly with your billing cycle. Any usage beyond
							your plan's included credits is billed on a usage basis.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-9">
						<AccordionTrigger>
							Can I export my data? What happens when I cancel?
						</AccordionTrigger>
						<AccordionContent>
							You can export your data anytime. Conversation retention follows
							your plan limits. After cancellation, data is retained for 180
							days before deletion.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-10">
						<AccordionTrigger>How does billing work?</AccordionTrigger>
						<AccordionContent>
							Billing is in USD only via Polar. Taxes/VAT are calculated at
							checkout based on your location. Invoices are automatically
							emailed after each payment.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-11">
						<AccordionTrigger>
							What support comes with each plan?
						</AccordionTrigger>
						<AccordionContent>
							Free plan includes email support. Hobby adds Slack support from
							the founder. Pro includes a dedicated Slack channel. No formal SLA
							is offered currently.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-12">
						<AccordionTrigger>
							Where is my data hosted and what about compliance?
						</AccordionTrigger>
						<AccordionContent>
							Data is hosted in the US with GDPR and SOC 2 compliance
							prioritized. Regional hosting choice (US or EU) is coming soon.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="item-13">
						<AccordionTrigger>Can I cancel anytime?</AccordionTrigger>
						<AccordionContent>
							Absolutely. You can cancel your subscription at any time. Your
							access will continue until the end of your current billing period.
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</div>
		</div>
	);
}
