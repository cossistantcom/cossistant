"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";

type StepBasicsSummaryProps = {
	name: string;
	sourceUrl: string;
	urlWasProvided: boolean;
	isUrlValid: boolean;
	crawlEnabled: boolean;
	selectedGoals: string[];
	onEdit?: () => void;
	// Prompt generation info (optional - shown when prompt is generated)
	promptGenerated?: boolean;
	companyName?: string;
	websiteDescription?: string | null;
	manualDescription?: string;
	discoveredLinksCount?: number;
};

export function StepBasicsSummary({
	name,
	sourceUrl,
	urlWasProvided,
	isUrlValid,
	crawlEnabled,
	selectedGoals,
	onEdit,
	promptGenerated,
	companyName,
	websiteDescription,
	manualDescription,
	discoveredLinksCount,
}: StepBasicsSummaryProps) {
	const description = websiteDescription ?? manualDescription;

	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className="rounded border border-plasma-green bg-plasma-green/5 p-4"
			initial={{ opacity: 0, y: -10 }}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1 space-y-2">
					{/* Agent name and URL */}
					<div className="flex items-center gap-2 font-medium text-primary text-sm">
						<p>{name}</p>
						{urlWasProvided && isUrlValid && (
							<p className="flex items-center gap-1.5">
								- Using {new URL(sourceUrl).hostname}
							</p>
						)}
						{!crawlEnabled && (
							<p className="flex items-center gap-1.5">
								- <Icon className="size-3" name="help" />
								Manual setup
							</p>
						)}
					</div>

					{/* Description from website or manual input */}
					{promptGenerated && description && (
						<p className="line-clamp-2 text-muted-foreground text-xs">
							{description}
						</p>
					)}

					{/* Summary row with goals */}
					{selectedGoals.length > 0 && (
						<div className="flex flex-wrap items-center gap-3 text-primary text-xs">
							<span className="flex items-center gap-1">
								<Icon className="size-3" name="star" />
								{selectedGoals.length} goal
								{selectedGoals.length !== 1 ? "s" : ""}
							</span>
						</div>
					)}
				</div>
				{onEdit && (
					<Button
						className="shrink-0"
						onClick={onEdit}
						size="sm"
						type="button"
						variant="ghost"
					>
						Edit
					</Button>
				)}
			</div>

			{/* Discovered links count - shown when prompt is generated and links were found */}
			{promptGenerated &&
				discoveredLinksCount !== undefined &&
				discoveredLinksCount > 0 && (
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="mt-3 flex items-center gap-2 border-plasma-green/30 border-t pt-3"
						initial={{ opacity: 0, y: 5 }}
						transition={{ delay: 0.2 }}
					>
						<span className="text-sm">
							<span className="font-medium">{discoveredLinksCount}</span>{" "}
							<span className="text-muted-foreground">
								pages discovered for knowledge base
							</span>
						</span>
					</motion.div>
				)}
		</motion.div>
	);
}
