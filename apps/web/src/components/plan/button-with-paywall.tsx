"use client";

import type { FeatureKey } from "@api/lib/plans/config";
import type { RouterOutputs } from "@plasma/api/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { UpgradeModal } from "./upgrade-modal";

type PlanInfo = RouterOutputs["plan"]["getPlanInfo"];

export type ButtonWithPaywallProps = Omit<ButtonProps, "onClick"> & {
	/**
	 * The feature key to check access for.
	 * This is also used to highlight the specific feature in the upgrade modal.
	 */
	featureKey: FeatureKey;

	/**
	 * The website slug to check plan access for.
	 */
	websiteSlug: string;

	/**
	 * The click handler to call when the feature is available.
	 */
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

/**
 * Helper to check if a feature value indicates access is granted.
 * - `true` or any positive number means access is granted
 * - `false`, `0`, or `null` (unlimited) means access is granted for null, denied for false/0
 */
function hasFeatureAccess(
	value: PlanInfo["plan"]["features"][FeatureKey]
): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	// null means unlimited (access granted), numbers mean limited but available
	if (value === null || (typeof value === "number" && value > 0)) {
		return true;
	}
	return false;
}

/**
 * A button that gates a feature behind a paywall.
 *
 * If the user has access to the feature (based on their plan), the button
 * behaves normally and calls the `onClick` handler.
 *
 * If the user does not have access, clicking the button opens the upgrade
 * modal with the feature highlighted in the comparison table.
 *
 * @example
 * ```tsx
 * <ButtonWithPaywall
 *   featureKey="dashboard-file-sharing"
 *   websiteSlug={websiteSlug}
 *   onClick={handleAttachFiles}
 * >
 *   <AttachIcon />
 * </ButtonWithPaywall>
 * ```
 */
export function ButtonWithPaywall({
	featureKey,
	websiteSlug,
	onClick,
	disabled,
	...buttonProps
}: ButtonWithPaywallProps) {
	const trpc = useTRPC();
	const [isModalOpen, setIsModalOpen] = useState(false);

	const { data: planInfo, isLoading } = useQuery(
		trpc.plan.getPlanInfo.queryOptions({ websiteSlug })
	);

	const featureValue = planInfo?.plan.features[featureKey];
	const hasAccess =
		featureValue !== undefined && hasFeatureAccess(featureValue);

	const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		if (!hasAccess) {
			// User doesn't have access - show upgrade modal
			setIsModalOpen(true);
			return;
		}

		// User has access - call the original onClick
		onClick?.(event);
	};

	return (
		<>
			<Button
				{...buttonProps}
				disabled={disabled || isLoading}
				onClick={handleClick}
			/>

			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey={featureKey}
					initialPlanName="hobby"
					onOpenChange={setIsModalOpen}
					open={isModalOpen}
					websiteSlug={websiteSlug}
				/>
			)}
		</>
	);
}
