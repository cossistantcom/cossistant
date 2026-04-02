"use client";

import {
	FEATURE_CONFIG,
	type FeatureKey,
	type FeatureValue,
	PLAN_CONFIG,
	type PlanName,
} from "@api/lib/plans/config";
import type { RouterOutputs } from "@plasma/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PromoBannerOrnaments } from "@/app/(lander-docs)/pricing/promo-banner-ornaments";
import { PromoIndicator } from "@/app/(lander-docs)/pricing/promo-indicator";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type PlanInfo = RouterOutputs["plan"]["getPlanInfo"];

type UpgradeModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentPlan: PlanInfo["plan"];
	initialPlanName: PlanName;
	websiteSlug: string;
	/**
	 * Optional feature key to highlight in the feature comparison table.
	 * When provided, the feature row will be displayed at the top with orange styling
	 * to show the user exactly what they'll unlock by upgrading.
	 * @example "dashboard-file-sharing"
	 */
	highlightedFeatureKey?: FeatureKey;
};

const PLAN_SEQUENCE: PlanName[] = ["free", "hobby", "pro"];
const PLAN_DESCRIPTIONS: Record<PlanName, string> = {
	free: "Perfect for getting started",
	hobby: "For growing teams shipping faster",
	pro: "For teams that need advanced controls",
};

function formatFeatureValue(value: number | null): string {
	if (value === null) {
		return "Unlimited";
	}
	return value.toLocaleString();
}

function formatFeatureValueWithUnit(
	value: number | null,
	valueUnitLabel?: string
): string {
	const formattedValue = formatFeatureValue(value);

	if (value === null || !valueUnitLabel) {
		return formattedValue;
	}

	return `${formattedValue} ${valueUnitLabel}`;
}

function PlanPriceDisplay({
	price,
	promoPrice,
	className,
	align = "end",
}: {
	price?: number;
	promoPrice?: number;
	className?: string;
	align?: "start" | "end";
}) {
	const alignmentClasses =
		align === "start" ? "items-start text-left" : "items-end text-right";

	const hasPromo =
		typeof promoPrice === "number" &&
		typeof price === "number" &&
		promoPrice < price;

	return (
		<div
			className={cn(
				"flex min-h-[32px] flex-col justify-center",
				alignmentClasses,
				className
			)}
		>
			{hasPromo ? (
				<div className="flex items-baseline gap-2">
					<p className="font-semibold text-base text-plasma-orange">
						${promoPrice}
					</p>
					<p className="text-muted-foreground text-sm line-through">${price}</p>
					<span className="text-primary/60 text-xs">/month</span>
				</div>
			) : price ? (
				<p className="text-primary/70 text-sm">${price}/month</p>
			) : (
				<p className="text-primary/70 text-sm">Free</p>
			)}
		</div>
	);
}

function FeatureRow({
	label,
	currentValue,
	targetValue,
	valueUnitLabel,
	isHighlighted,
}: {
	label: string;
	currentValue: number | null;
	targetValue: number | null;
	valueUnitLabel?: string;
	isHighlighted?: boolean;
}) {
	const isUpgrade = (current: number | null, target: number | null) => {
		if (current === null && target === null) {
			return false;
		}
		if (current === null) {
			return false; // Unlimited -> Limited is not upgrade
		}
		if (target === null) {
			return true; // Limited -> Unlimited is upgrade
		}
		return target > current;
	};

	const isSame = currentValue === targetValue;
	const upgraded = isUpgrade(currentValue, targetValue);

	return (
		<div className="flex items-center justify-between border-primary/5 border-b py-2 last:border-0">
			<span
				className={cn(
					"font-medium text-sm",
					isHighlighted && "text-plasma-orange"
				)}
			>
				{label}
			</span>
			<div className="flex items-center gap-3">
				<span
					className={cn(
						"text-sm",
						isHighlighted
							? "text-plasma-orange/60"
							: isSame
								? "text-primary/60"
								: "text-primary/40"
					)}
				>
					{formatFeatureValueWithUnit(currentValue, valueUnitLabel)}
				</span>
				<ArrowRight
					className={cn(
						"mx-2 size-4 text-primary/40",
						isHighlighted && "text-plasma-orange/60"
					)}
				/>
				<span
					className={cn(
						"min-w-[100px] text-right font-semibold text-sm",
						upgraded && "text-primary",
						isHighlighted && "text-plasma-orange"
					)}
				>
					{formatFeatureValueWithUnit(targetValue, valueUnitLabel)}
				</span>
				{upgraded && (
					<Check
						className={cn(
							"size-4 text-primary",
							isHighlighted && "text-plasma-orange"
						)}
					/>
				)}
			</div>
		</div>
	);
}

function BooleanFeatureRow({
	label,
	currentValue,
	targetValue,
	isHighlighted,
}: {
	label: string;
	currentValue: boolean;
	targetValue: boolean;
	isHighlighted?: boolean;
}) {
	const upgraded = !currentValue && targetValue;

	return (
		<div className="flex items-center justify-between border-primary/5 border-b py-2 last:border-0">
			<span
				className={cn(
					"font-medium text-sm",
					isHighlighted && "text-plasma-orange"
				)}
			>
				{label}
			</span>
			<div className="flex items-center gap-3">
				<span
					className={cn(
						"text-primary/40 text-sm",
						isHighlighted && "text-plasma-orange/60"
					)}
				>
					{currentValue ? "Yes" : "No"}
				</span>
				<ArrowRight
					className={cn(
						"mx-2 size-4 text-primary/40",
						isHighlighted && "text-plasma-orange/60"
					)}
				/>
				<span
					className={cn(
						"min-w-[100px] text-right font-semibold text-sm",
						upgraded && "text-primary",
						isHighlighted && "text-plasma-orange"
					)}
				>
					{targetValue ? "Yes" : "No"}
				</span>
				{upgraded && (
					<Check
						className={cn(
							"size-4 text-primary",
							isHighlighted && "text-plasma-orange"
						)}
					/>
				)}
			</div>
		</div>
	);
}

function toNumericFeatureValue(value: FeatureValue): number | null {
	if (typeof value === "number" || value === null) {
		return value;
	}

	// Boolean feature flags shouldn't reach numeric rows; fall back to 0/Unlimited.
	return value ? null : 0;
}

export function UpgradeModal({
	open,
	onOpenChange,
	currentPlan,
	initialPlanName,
	websiteSlug,
	highlightedFeatureKey,
}: UpgradeModalProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const preferredPlanName = useMemo<PlanName>(
		() => (PLAN_CONFIG.pro ? "pro" : initialPlanName),
		[initialPlanName]
	);
	const [selectedPlanName, setSelectedPlanName] =
		useState<PlanName>(preferredPlanName);

	useEffect(() => {
		if (open) {
			setSelectedPlanName(preferredPlanName);
		}
	}, [preferredPlanName, open]);

	const currentPlanConfig = PLAN_CONFIG[currentPlan.name] ?? PLAN_CONFIG.free;
	const selectedPlanConfig = PLAN_CONFIG[selectedPlanName] ?? PLAN_CONFIG.free;

	const currentIndex = PLAN_SEQUENCE.indexOf(currentPlan.name);
	const selectedIndex = PLAN_SEQUENCE.indexOf(selectedPlanName);
	const isSamePlan = currentPlan.name === selectedPlanName;
	const isDowngrade =
		currentIndex !== -1 && selectedIndex !== -1 && selectedIndex < currentIndex;

	const actionLabel = isSamePlan
		? "You're already on this plan"
		: `${isDowngrade ? "Downgrade" : "Upgrade"} to ${selectedPlanConfig.displayName}`;

	const billingHref = `/${websiteSlug}/billing`;
	const hasPolarProduct = Boolean(selectedPlanConfig.polarProductId);

	const launchDiscountPercent = useMemo(() => {
		const discounts: number[] = [];
		for (const plan of [PLAN_CONFIG.hobby, PLAN_CONFIG.pro]) {
			if (
				typeof plan.price === "number" &&
				typeof plan.priceWithPromo === "number" &&
				plan.priceWithPromo < plan.price
			) {
				const percent = Math.round(
					((plan.price - plan.priceWithPromo) / plan.price) * 100
				);
				discounts.push(percent);
			}
		}
		return discounts.length > 0 ? Math.max(...discounts) : null;
	}, []);

	const { mutateAsync: createCheckout, isPending: isLoading } = useMutation(
		trpc.plan.createCheckout.mutationOptions({
			onSuccess: async (data) => {
				if (data.mode === "checkout" && data.checkoutUrl) {
					window.location.href = data.checkoutUrl;
					return;
				}

				await queryClient.invalidateQueries({
					queryKey: trpc.plan.getPlanInfo.queryKey({ websiteSlug }),
				});
				toast.success("Plan updated successfully.");
				onOpenChange(false);
			},
			onError: (error) => {
				toast.error("We couldn't start the upgrade.");
			},
		})
	);

	const handlePlanChange = async () => {
		if (isSamePlan || !hasPolarProduct) {
			return;
		}
		try {
			await createCheckout({
				websiteSlug,
				targetPlan: selectedPlanName,
			});
		} catch (error) {
			// Error handled in onError
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-[640px]">
				<DialogHeader>
					<DialogTitle>Change plan</DialogTitle>
					<DialogDescription>
						Compare plans side-by-side and select the one that fits your team.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 py-4">
					{launchDiscountPercent && (
						<div className="p-2">
							<PromoBannerOrnaments>
								<div className="flex flex-col items-center justify-center gap-1 rounded px-4 py-3 text-center">
									<div className="flex flex-wrap items-center justify-center gap-1 text-plasma-orange text-sm">
										Limited launch offer – up to
										<span className="font-semibold">
											{launchDiscountPercent}% off
										</span>
										lifetime while subscribed.
									</div>
								</div>
							</PromoBannerOrnaments>
						</div>
					)}
					<div>
						<p className="mb-2 font-semibold text-muted-foreground text-sm">
							Choose a plan
						</p>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
							{PLAN_SEQUENCE.map((planName: PlanName) => {
								const plan = PLAN_CONFIG[planName];
								const isSelected = selectedPlanName === planName;
								const isCurrent = currentPlan.name === planName;
								const hasPromo =
									typeof plan.price === "number" &&
									typeof plan.priceWithPromo === "number" &&
									plan.priceWithPromo < plan.price;

								return (
									<button
										className={cn(
											"rounded border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											isSelected
												? "border-primary bg-primary/5"
												: "hover:border-primary/40"
										)}
										key={plan.name}
										onClick={() => setSelectedPlanName(planName)}
										type="button"
									>
										<div className="flex h-16 items-start justify-between gap-4">
											<div className="flex flex-1 flex-col items-start">
												<p className="flex items-center gap-1 font-semibold">
													{plan.displayName}
													{hasPromo && (
														<PromoIndicator
															price={plan.price}
															promoPrice={plan.priceWithPromo}
														/>
													)}
													{planName === "pro" && (
														<span className="z-0 font-medium text-plasma-orange text-xs">
															[Best value]
														</span>
													)}
												</p>
												{isCurrent && (
													<span className="text-primary/60 text-xs">
														Current plan
													</span>
												)}
											</div>
											{/* <PlanPriceDisplay
                        align="end"
                        price={plan.price}
                        promoPrice={plan.priceWithPromo}
                        className="flex-col"
                      /> */}
										</div>
										<p className="text-muted-foreground text-xs">
											{PLAN_DESCRIPTIONS[planName]}
										</p>
									</button>
								);
							})}
						</div>
					</div>

					<div className="">
						<div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Current plan
								</p>
								<h3 className="font-semibold text-lg">
									{currentPlanConfig.displayName}
								</h3>
								<PlanPriceDisplay
									align="start"
									price={currentPlan.price}
									promoPrice={currentPlanConfig.priceWithPromo}
								/>
							</div>
							<div className="text-right">
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									{isSamePlan
										? "Selected plan"
										: isDowngrade
											? "Downgrade to"
											: "Upgrade to"}
								</p>
								<h3 className="font-semibold text-lg">
									{selectedPlanConfig.displayName}
								</h3>
								<PlanPriceDisplay
									align="end"
									price={selectedPlanConfig.price}
									promoPrice={selectedPlanConfig.priceWithPromo}
								/>
							</div>
						</div>

						<div className="mt-6 space-y-1">
							{highlightedFeatureKey &&
								(() => {
									const featureConfig = FEATURE_CONFIG[highlightedFeatureKey];
									const currentValue =
										currentPlan.features[highlightedFeatureKey];
									const targetValue =
										selectedPlanConfig.features[highlightedFeatureKey];
									const isBooleanFeature = typeof currentValue === "boolean";

									if (isBooleanFeature) {
										return (
											<BooleanFeatureRow
												currentValue={currentValue as boolean}
												isHighlighted
												label={featureConfig.name}
												targetValue={targetValue as boolean}
											/>
										);
									}

									return (
										<FeatureRow
											currentValue={toNumericFeatureValue(currentValue)}
											isHighlighted
											label={featureConfig.name}
											targetValue={toNumericFeatureValue(targetValue)}
											valueUnitLabel={featureConfig.unit}
										/>
									);
								})()}
							<FeatureRow
								currentValue={toNumericFeatureValue(
									currentPlan.features.conversations
								)}
								label="Conversations (Rolling 30 Days)"
								targetValue={toNumericFeatureValue(
									selectedPlanConfig.features.conversations
								)}
							/>
							<FeatureRow
								currentValue={toNumericFeatureValue(
									currentPlan.features.messages
								)}
								label="Messages (Rolling 30 Days)"
								targetValue={toNumericFeatureValue(
									selectedPlanConfig.features.messages
								)}
							/>
							<FeatureRow
								currentValue={toNumericFeatureValue(
									currentPlan.features.contacts
								)}
								label="Contacts"
								targetValue={toNumericFeatureValue(
									selectedPlanConfig.features.contacts
								)}
							/>
							<FeatureRow
								currentValue={toNumericFeatureValue(
									currentPlan.features["conversation-retention"]
								)}
								label="Conversation Retention"
								targetValue={toNumericFeatureValue(
									selectedPlanConfig.features["conversation-retention"]
								)}
								valueUnitLabel="days"
							/>
							<FeatureRow
								currentValue={toNumericFeatureValue(
									currentPlan.features["team-members"]
								)}
								label="Team Members"
								targetValue={toNumericFeatureValue(
									selectedPlanConfig.features["team-members"]
								)}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<Button asChild variant="outline">
						<Link href={billingHref}>View billing</Link>
					</Button>
					<div className="flex flex-1 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
						{!(hasPolarProduct || isSamePlan) && (
							<p className="text-center text-muted-foreground text-xs sm:text-right">
								Manage this change from the billing portal.
							</p>
						)}
						<Button
							disabled={isLoading}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={isLoading || isSamePlan || !hasPolarProduct}
							onClick={handlePlanChange}
							type="button"
						>
							{isLoading ? "Redirecting..." : actionLabel}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
