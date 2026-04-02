"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { useMemo, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { UpgradeModal } from "./upgrade-modal";

type PlanInfo = RouterOutputs["plan"]["getPlanInfo"];

function getUsagePercentage(limit: number | null, used: number): number {
	if (limit === null || limit <= 0) {
		return 0;
	}

	return Math.min(100, Math.round((used / limit) * 100));
}

type HardLimitRowProps = {
	label: string;
	used: number;
	limit: number | null;
	reached: boolean;
	enforced: boolean;
};

function HardLimitRow({
	label,
	used,
	limit,
	reached,
	enforced,
}: HardLimitRowProps) {
	const percentage = getUsagePercentage(limit, used);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-xs">
				<span className="font-medium text-primary/90">{label}</span>
				<span
					className={cn("text-primary/70", reached && "text-plasma-orange")}
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
			{reached ? (
				<div className="text-[11px] text-plasma-orange">
					{enforced
						? "Limit reached"
						: "Limit reached (temporarily not enforced)"}
				</div>
			) : null}
		</div>
	);
}

type SidebarUpgradeButtonProps = {
	websiteSlug: string;
	planInfo: PlanInfo;
};

export function SidebarUpgradeButton({
	websiteSlug,
	planInfo,
}: SidebarUpgradeButtonProps) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const { plan, hardLimitStatus } = planInfo;

	const highlightedFeatureKey = useMemo(() => {
		if (hardLimitStatus.conversations.reached) {
			return "conversations" as const;
		}

		return "messages" as const;
	}, [hardLimitStatus.conversations.reached]);

	if (plan.name !== "free") {
		return null;
	}

	return (
		<>
			<button
				className="relative flex h-auto w-full flex-col gap-3 overflow-hidden rounded-[2px] border border-plasma-orange/60 border-dashed bg-plasma-orange/[0.02] p-4 text-left hover:bg-plasma-orange/5 dark:border-plasma-orange/20"
				onClick={() => setIsModalOpen(true)}
				type="button"
			>
				<div className="font-medium text-plasma-orange text-sm">
					Upgrade to Pro
				</div>

				{!hardLimitStatus.enforced && (
					<div className="rounded border border-plasma-orange/30 bg-plasma-orange/5 px-2 py-1 text-[11px] text-plasma-orange">
						Hard-limit checks are temporarily unavailable while billing sync
						recovers.
					</div>
				)}

				<div className="space-y-3">
					<HardLimitRow
						enforced={hardLimitStatus.enforced}
						label="Messages"
						limit={hardLimitStatus.messages.limit}
						reached={hardLimitStatus.messages.reached}
						used={hardLimitStatus.messages.used}
					/>
					<HardLimitRow
						enforced={hardLimitStatus.enforced}
						label="Conversations"
						limit={hardLimitStatus.conversations.limit}
						reached={hardLimitStatus.conversations.reached}
						used={hardLimitStatus.conversations.used}
					/>
				</div>

				<div className="text-[11px] text-primary/60">
					Rolling {hardLimitStatus.rollingWindowDays}-day window
				</div>
			</button>

			<UpgradeModal
				currentPlan={plan}
				highlightedFeatureKey={highlightedFeatureKey}
				initialPlanName="pro"
				onOpenChange={setIsModalOpen}
				open={isModalOpen}
				websiteSlug={websiteSlug}
			/>
		</>
	);
}
