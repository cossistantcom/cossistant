"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { AI_AGENT_GOALS } from "@plasma/types";
import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type StepBasicsProps = {
	name: string;
	setName: (name: string) => void;
	crawlEnabled: boolean;
	setCrawlEnabled: (enabled: boolean) => void;
	sourceUrl: string;
	setSourceUrl: (url: string) => void;
	selectedGoals: string[];
	setSelectedGoals: React.Dispatch<React.SetStateAction<string[]>>;
	isSubmitting: boolean;
	isStep1Valid: boolean;
	onContinue: () => void;
	websiteName: string;
	/** Crawl pages limit from plan (null = unlimited) */
	crawlPagesLimit: number | null;
	/** Whether the user is on the free plan */
	isFreePlan: boolean;
	/** Website slug for upgrade modal */
	websiteSlug: string;
	/** Plan info for upgrade modal */
	planInfo: RouterOutputs["plan"]["getPlanInfo"] | undefined;
};

export function StepBasics({
	websiteName,
	name,
	setName,
	crawlEnabled,
	setCrawlEnabled,
	sourceUrl,
	setSourceUrl,
	selectedGoals,
	setSelectedGoals,
	isSubmitting,
	isStep1Valid,
	onContinue,
	crawlPagesLimit,
	isFreePlan,
	websiteSlug,
	planInfo,
}: StepBasicsProps) {
	const [showUpgradeModal, setShowUpgradeModal] = useState(false);

	const handleGoalToggle = useCallback(
		(goalValue: string) => {
			setSelectedGoals((prev) =>
				prev.includes(goalValue)
					? prev.filter((g) => g !== goalValue)
					: [...prev, goalValue]
			);
		},
		[setSelectedGoals]
	);

	return (
		<>
			{/* Agent Name */}
			<div className="space-y-2">
				<Label htmlFor="agent-name">Agent Name</Label>
				<Input
					disabled={isSubmitting}
					id="agent-name"
					onChange={(e) => setName(e.target.value)}
					placeholder={`${websiteName} AI`}
					value={name}
				/>
				<p className="text-muted-foreground text-xs">
					A friendly name for your AI agent
				</p>
			</div>

			{/* Crawl Toggle */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<div className="space-y-0.5">
						<Label htmlFor="crawl-toggle">Crawl my website</Label>
						<p className="text-muted-foreground text-xs">
							We'll analyze your website to personalize your agent
						</p>
					</div>
					<Switch
						checked={crawlEnabled}
						disabled={isSubmitting}
						id="crawl-toggle"
						onCheckedChange={setCrawlEnabled}
					/>
				</div>

				{/* Crawl limit info for free users */}
				{crawlEnabled && isFreePlan && crawlPagesLimit !== null && (
					<motion.div
						animate={{ opacity: 1, height: "auto" }}
						initial={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.2 }}
					>
						<p className="text-plasma-orange text-sm">
							Free plan includes{" "}
							<span className="font-semibold">
								{crawlPagesLimit.toLocaleString()} pages total
							</span>
							.{" "}
							<button
								className="font-medium underline hover:no-underline"
								onClick={() => setShowUpgradeModal(true)}
								type="button"
							>
								Upgrade for 1,000+ pages
							</button>
						</p>
					</motion.div>
				)}
			</div>

			{/* Source URL - only show if crawl is enabled */}
			{crawlEnabled && (
				<motion.div
					animate={{ opacity: 1, height: "auto" }}
					className="space-y-2"
					initial={{ opacity: 0, height: 0 }}
					transition={{ duration: 0.2 }}
				>
					<Label htmlFor="source-url">Website URL</Label>
					<Input
						disabled={isSubmitting}
						id="source-url"
						onChange={(e) => setSourceUrl(e.target.value)}
						placeholder="https://example.com"
						type="url"
						value={sourceUrl}
					/>
					<p className="text-muted-foreground text-xs">
						We'll use this to personalize your agent's responses
					</p>
				</motion.div>
			)}

			{/* Goals Multi-select */}
			<div className="space-y-3">
				<Label>What do you want your AI agent to do?</Label>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{AI_AGENT_GOALS.map((goal) => (
						<label
							className="flex cursor-pointer items-center gap-3 rounded-lg border border-input p-3 transition-colors hover:bg-background-100 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 dark:hover:bg-background-200"
							htmlFor={`goal-${goal.value}`}
							key={goal.value}
						>
							<Checkbox
								checked={selectedGoals.includes(goal.value)}
								disabled={isSubmitting}
								id={`goal-${goal.value}`}
								onCheckedChange={() => handleGoalToggle(goal.value)}
							/>
							<span className="text-sm">{goal.label}</span>
						</label>
					))}
				</div>
			</div>

			{/* Action Button */}
			<div className="pt-2">
				<Button disabled={!isStep1Valid} onClick={onContinue} type="button">
					Continue
					<Icon className="ml-2 size-4" name="arrow-right" />
				</Button>
			</div>

			{/* Upgrade Modal */}
			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="ai-agent-training-pages-total"
					initialPlanName="hobby"
					onOpenChange={setShowUpgradeModal}
					open={showUpgradeModal}
					websiteSlug={websiteSlug}
				/>
			)}
		</>
	);
}
