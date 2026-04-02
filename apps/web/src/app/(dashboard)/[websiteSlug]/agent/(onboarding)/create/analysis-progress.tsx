"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";

type AnalysisStep = "crawling" | "analyzing" | "crafting" | "complete";

const CRAFTING_MESSAGES = [
	"Crafting personalized prompt...",
	"Nice website btw...",
	"Getting there...",
	"Last bits to crunch...",
];

type AnalysisProgressProps = {
	analysisStep: AnalysisStep;
	/** Crawl pages limit from plan (null = unlimited) */
	crawlPagesLimit?: number | null;
};

function StepIndicator({
	isActive,
	isComplete,
	isPending,
}: {
	isActive: boolean;
	isComplete: boolean;
	isPending: boolean;
}) {
	return (
		<div className="flex size-5 items-center justify-center">
			{isPending ? (
				<div className="size-2 rounded-full" />
			) : isActive ? (
				<Spinner className="size-2 text-primary" />
			) : isComplete ? (
				<motion.div animate={{ scale: 1 }} initial={{ scale: 0 }}>
					<Icon className="size-4 text-plasma-green" name="check" />
				</motion.div>
			) : null}
		</div>
	);
}

export function AnalysisProgress({
	analysisStep,
	crawlPagesLimit,
}: AnalysisProgressProps) {
	const [craftingMessageIndex, setCraftingMessageIndex] = useState(0);

	// Cycle through crafting messages when on the crafting step
	useEffect(() => {
		if (analysisStep !== "crafting") {
			setCraftingMessageIndex(0);
			return;
		}

		const interval = setInterval(() => {
			setCraftingMessageIndex((prev) => (prev + 1) % CRAFTING_MESSAGES.length);
		}, 3000);

		return () => clearInterval(interval);
	}, [analysisStep]);

	const crawlLimitText =
		crawlPagesLimit === null || crawlPagesLimit === undefined
			? ""
			: ` (up to ${crawlPagesLimit.toLocaleString()} pages)`;

	const steps = [
		{
			id: "crawling",
			label: `Crawling your website${crawlLimitText}...`,
		},
		{
			id: "analyzing",
			label: "Analyzing what your business does...",
		},
		{
			id: "crafting",
			label: CRAFTING_MESSAGES[craftingMessageIndex],
		},
	] as const;

	const stepOrder = ["crawling", "analyzing", "crafting"] as const;

	const getStepState = (stepId: (typeof stepOrder)[number]) => {
		const currentIndex = stepOrder.indexOf(
			analysisStep as (typeof stepOrder)[number]
		);
		const stepIndex = stepOrder.indexOf(stepId);

		return {
			isActive: analysisStep === stepId,
			isComplete: stepIndex < currentIndex,
			isPending: stepIndex > currentIndex,
		};
	};

	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className="rounded-md border p-4"
			initial={{ opacity: 0, y: -10 }}
		>
			<div className="space-y-3">
				{steps.map((step) => {
					const state = getStepState(step.id);
					const isCraftingStep = step.id === "crafting";
					return (
						<div className="flex items-center gap-3" key={step.id}>
							<StepIndicator {...state} />
							{isCraftingStep && state.isActive ? (
								<AnimatePresence mode="wait">
									<motion.span
										animate={{ opacity: 1, y: 0 }}
										className="font-medium text-foreground text-sm"
										exit={{ opacity: 0, y: -5 }}
										initial={{ opacity: 0, y: 5 }}
										key={craftingMessageIndex}
										transition={{ duration: 0.2 }}
									>
										{step.label}
									</motion.span>
								</AnimatePresence>
							) : (
								<span
									className={`text-sm ${
										state.isActive
											? "font-medium text-foreground"
											: state.isPending
												? "text-muted-foreground/50"
												: "text-muted-foreground"
									}`}
								>
									{step.label}
								</span>
							)}
						</div>
					);
				})}
			</div>
		</motion.div>
	);
}
