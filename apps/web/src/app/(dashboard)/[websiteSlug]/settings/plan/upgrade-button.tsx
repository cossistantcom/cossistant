"use client";

import { PLAN_CONFIG, type PlanName } from "@api/lib/plans/config";
import type { RouterOutputs } from "@plasma/api/types";
import { useState } from "react";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type PlanInfo = RouterOutputs["plan"]["getPlanInfo"];

type UpgradeButtonProps = {
	planInfo: PlanInfo;
	websiteSlug: string;
};

function getUsagePercentage(limit: number | null, used: number): number {
	if (limit === null || limit <= 0) {
		return 0;
	}

	return Math.min(100, Math.round((used / limit) * 100));
}

function UsagePreviewRow({
	label,
	used,
	limit,
	reached,
}: {
	label: string;
	used: number;
	limit: number | null;
	reached: boolean;
}) {
	const percentage = getUsagePercentage(limit, used);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-3 text-[11px]">
				<span className="font-medium text-primary/85">{label}</span>
				<span
					className={cn("text-primary/65", reached && "text-plasma-orange")}
				>
					{limit === null
						? `${used.toLocaleString()} / Unlimited`
						: `${used.toLocaleString()} / ${limit.toLocaleString()}`}
				</span>
			</div>
			{limit !== null ? (
				<Progress
					className={cn(
						"h-1.5 bg-background-200/80 dark:bg-background-800",
						reached && "bg-plasma-orange/10"
					)}
					indicatorClassName={
						reached ? "text-plasma-orange" : "text-primary/55"
					}
					value={percentage}
				/>
			) : null}
		</div>
	);
}

export function UpgradeButton({ planInfo, websiteSlug }: UpgradeButtonProps) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const { plan, hardLimitStatus } = planInfo;

	const proPlan = PLAN_CONFIG.pro;
	const nextPlanName: PlanName | null =
		plan.name === "pro" || !proPlan ? null : "pro";

	const buttonLabel = nextPlanName
		? `Upgrade to ${PLAN_CONFIG[nextPlanName].displayName}`
		: "Change plan";

	const initialPlanName = nextPlanName ?? plan.name;

	return (
		<>
			{plan.name === "free" ? (
				<button
					className="relative flex h-auto min-w-[260px] flex-col gap-3 overflow-hidden rounded-[2px] border border-plasma-orange/60 border-dashed bg-plasma-orange/[0.02] p-4 text-left hover:bg-plasma-orange/5 dark:border-plasma-orange/20"
					onClick={() => setIsModalOpen(true)}
					type="button"
				>
					<div className="flex items-start justify-between gap-3">
						<div className="font-medium text-plasma-orange text-sm">
							{buttonLabel}
						</div>
						<div className="text-[11px] text-primary/60">
							Rolling {hardLimitStatus.rollingWindowDays}-day window
						</div>
					</div>

					{!hardLimitStatus.enforced && (
						<div className="rounded border border-plasma-orange/30 bg-plasma-orange/5 px-2 py-1 text-[11px] text-plasma-orange">
							Hard-limit checks are temporarily unavailable while billing sync
							recovers.
						</div>
					)}

					<div className="space-y-3">
						<UsagePreviewRow
							label="Messages"
							limit={hardLimitStatus.messages.limit}
							reached={hardLimitStatus.messages.reached}
							used={hardLimitStatus.messages.used}
						/>
						<UsagePreviewRow
							label="Conversations"
							limit={hardLimitStatus.conversations.limit}
							reached={hardLimitStatus.conversations.reached}
							used={hardLimitStatus.conversations.used}
						/>
					</div>
				</button>
			) : (
				<Button onClick={() => setIsModalOpen(true)} type="button">
					{buttonLabel}
				</Button>
			)}
			<UpgradeModal
				currentPlan={plan}
				initialPlanName={initialPlanName}
				onOpenChange={setIsModalOpen}
				open={isModalOpen}
				websiteSlug={websiteSlug}
			/>
		</>
	);
}
