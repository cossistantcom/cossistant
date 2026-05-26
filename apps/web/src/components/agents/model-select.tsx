"use client";

import type { RouterOutputs } from "@cossistant/api/types";
import { useState } from "react";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import Icon, { type IconName } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type ModelSelectProps = {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	websiteSlug: string;
	planInfo: RouterOutputs["plan"]["getPlanInfo"] | undefined;
	/** Optional label to show above the select */
	label?: string;
	/** Optional description to show below the select */
	description?: string;
};

export function ModelSelect({
	value,
	onChange,
	disabled,
	websiteSlug,
	planInfo,
	label,
	description,
}: ModelSelectProps) {
	const [showUpgradeModal, setShowUpgradeModal] = useState(false);
	const aiModels = planInfo?.aiModels.items ?? [];
	const latestModelsFeature =
		planInfo?.plan.features["latest-ai-models"] === true;
	const hasLockedModels = aiModels.some(
		(model) => !model.selectableForCurrentPlan
	);
	const availableModels =
		aiModels.length > 0
			? aiModels
			: value
				? [
						{
							id: value,
							label: value,
							provider: "",
							icon: "agent",
							thinkingSupported: false,
							thinkingSurchargeCredits: 0,
							thinkingReasoningMaxTokens: null,
							selectableForCurrentPlan: true,
						},
					]
				: [];

	const handleValueChange = (newValue: string) => {
		const selectedModel = aiModels.find((model) => model.id === newValue);
		const isLocked = selectedModel
			? !selectedModel.selectableForCurrentPlan
			: false;

		if (isLocked) {
			setShowUpgradeModal(true);
			return;
		}

		onChange(newValue);
	};

	return (
		<>
			<div className="space-y-2">
				{label && <Label htmlFor="model-select">{label}</Label>}
				<Select
					disabled={disabled}
					onValueChange={handleValueChange}
					value={value}
				>
					<SelectTrigger id="model-select">
						<SelectValue placeholder="Select a model" />
					</SelectTrigger>
					<SelectContent>
						{availableModels.map((model) => {
							const showUpgradeBadge = !model.selectableForCurrentPlan;

							return (
								<SelectItem key={model.id} value={model.id}>
									<span className="flex items-center gap-2">
										<Icon
											className="size-4 text-foreground"
											name={model.icon as IconName}
										/>
										<span>{model.label}</span>
										{model.provider ? (
											<span className="text-muted-foreground text-xs">
												({model.provider})
											</span>
										) : null}
										{showUpgradeBadge && (
											<span className="rounded bg-cossistant-orange/10 px-1.5 py-0.5 font-medium text-[10px] text-cossistant-orange">
												Upgrade
											</span>
										)}
										{model.thinkingSupported && !showUpgradeBadge ? (
											<span className="rounded bg-cossistant-blue/10 px-1.5 py-0.5 font-medium text-[10px] text-cossistant-blue">
												Thinking
											</span>
										) : null}
									</span>
								</SelectItem>
							);
						})}
					</SelectContent>
				</Select>
				<div className="flex items-center justify-between">
					{description && (
						<p className="text-muted-foreground text-xs">{description}</p>
					)}
					{hasLockedModels && !latestModelsFeature && (
						<button
							className="font-medium text-cossistant-orange text-sm hover:underline"
							onClick={() => setShowUpgradeModal(true)}
							type="button"
						>
							Upgrade for more models
						</button>
					)}
				</div>
			</div>

			{/* Upgrade Modal */}
			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="latest-ai-models"
					initialPlanName="hobby"
					onOpenChange={setShowUpgradeModal}
					open={showUpgradeModal}
					websiteSlug={websiteSlug}
				/>
			)}
		</>
	);
}
