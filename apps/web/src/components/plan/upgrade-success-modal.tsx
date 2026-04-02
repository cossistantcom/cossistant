"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { getPlanPricing } from "@/lib/plan-pricing";
import { Logo } from "../ui/logo";

type PlanInfo = RouterOutputs["plan"]["getPlanInfo"];

type UpgradeSuccessModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	plan: PlanInfo["plan"];
	usage: PlanInfo["usage"];
	rollingWindowDays?: number;
};

// FeatureValue can be boolean, number, or null
// - true or null means unlimited
// - false means disabled
// - number is the actual value
type FeatureLimit = number | boolean | null;

function formatFeatureValue(value: FeatureLimit): string {
	if (value === null || value === true) {
		return "Unlimited";
	}
	if (value === false) {
		return "Disabled";
	}
	return value.toLocaleString();
}

function LimitRow({
	label,
	limit,
	usage,
}: {
	label: string;
	limit: FeatureLimit;
	usage?: number;
}) {
	return (
		<div className="flex items-center justify-between border-b py-3 last:border-0">
			<div className="flex items-center gap-2">
				<Check className="size-4 text-plasma-green" />
				<span className="font-medium text-sm">{label}</span>
			</div>
			<div className="text-right">
				<span className="font-semibold text-sm">
					{formatFeatureValue(limit)}
				</span>
			</div>
		</div>
	);
}

export function UpgradeSuccessModal({
	open,
	onOpenChange,
	plan,
	usage,
	rollingWindowDays = 30,
}: UpgradeSuccessModalProps) {
	const pricing = getPlanPricing(plan.name);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-[400px]">
				<DialogHeader>
					<div className="mb-2 flex justify-center">
						<div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
							<Logo />
						</div>
					</div>
					<DialogTitle className="text-center text-xl">
						Successfully Upgraded to {plan.displayName}!
					</DialogTitle>
					<DialogDescription className="text-center">
						Your plan has been upgraded and your rolling {rollingWindowDays}
						-day limits are now active.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-10 py-4">
					<div className="mb-4">
						<h3 className="font-semibold text-lg">{plan.displayName} Plan</h3>
						{pricing.hasPromo && typeof pricing.promoPrice === "number" ? (
							<div className="flex items-baseline gap-2 text-sm">
								<p className="font-semibold text-plasma-orange">
									${pricing.promoPrice}
								</p>
								{typeof pricing.price === "number" && (
									<p className="text-muted-foreground line-through">
										${pricing.price}
									</p>
								)}
								<span className="text-primary/60 text-xs">/month</span>
							</div>
						) : typeof (plan.price ?? pricing.price) === "number" ? (
							<p className="text-primary/60 text-sm">
								${(plan.price ?? pricing.price) as number}/month
							</p>
						) : (
							<p className="text-primary/60 text-sm">Free</p>
						)}
					</div>

					<div className="space-y-1">
						<LimitRow
							label="Contacts"
							limit={plan.features.contacts}
							usage={usage.contacts}
						/>
						<LimitRow
							label="Team Members"
							limit={plan.features["team-members"]}
							usage={usage.teamMembers}
						/>
						<LimitRow
							label={`Conversations (Rolling ${rollingWindowDays} Days)`}
							limit={plan.features.conversations}
							usage={usage.conversations}
						/>
						<LimitRow
							label={`Messages (Rolling ${rollingWindowDays} Days)`}
							limit={plan.features.messages}
							usage={usage.messages}
						/>
						<LimitRow
							label="Data Retention"
							limit={plan.features["conversation-retention"]}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} type="button">
						Got it, thanks!
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
