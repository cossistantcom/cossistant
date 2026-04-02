"use client";
import React, { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StepsContextValue = {
	completedSteps: Set<number>;
	toggleStep: (stepIndex: number) => void;
	interactive: boolean;
};

const StepsContext = createContext<StepsContextValue | null>(null);

export const useSteps = () => {
	const context = useContext(StepsContext);
	if (!context) {
		throw new Error("useSteps must be used within Steps component");
	}
	return context;
};

type StepProps = React.ComponentProps<"div"> & {
	enabled?: boolean;
	completed?: boolean;
	index?: number;
};

export const Step = ({
	className,
	children,
	enabled = true,
	completed = false,
	index = 0,
	...props
}: StepProps): React.ReactElement => {
	const context = useContext(StepsContext);

	const childArray = React.Children.toArray(children);
	const title = childArray[0];
	const content = childArray.slice(1);

	const isCompleted = completed ?? context?.completedSteps.has(index) ?? false;
	const interactive = context?.interactive ?? false;

	const handleToggleComplete = () => {
		if (context && enabled) {
			context.toggleStep(index);
		}
	};

	return (
		<div
			className={cn(
				"mt-8 flex flex-col gap-3 pb-8 [counter-increment:step]",
				!enabled && "pointer-events-none opacity-40",
				className
			)}
			{...props}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-5">
					<div
						className={cn(
							"flex size-4.5 shrink-0 items-center justify-center rounded border border-plasma-green bg-plasma-green/20 font-mono font-semibold text-[10px] text-plasma-green before:content-[counter(step)]",
							isCompleted &&
								"bg-plasma-green text-primary-foreground line-through",
							!enabled && "border-primary bg-primary/10 text-primary"
						)}
					/>
					<div className={cn(isCompleted && "line-through opacity-70")}>
						{title}
					</div>
				</div>
				{interactive && enabled && (
					<Button
						onClick={handleToggleComplete}
						size="sm"
						type="button"
						variant={isCompleted ? "outline" : "default"}
					>
						{isCompleted ? "Undo" : "Mark as done"}
					</Button>
				)}
			</div>
			{content.length > 0 && (
				<div className={cn("pl-10", isCompleted && "opacity-70")}>
					{content}
				</div>
			)}
		</div>
	);
};

type StepsProps = React.ComponentProps<"div"> & {
	interactive?: boolean;
};

export const Steps = ({
	className,
	interactive = false,
	children,
	...props
}: StepsProps): React.ReactElement => {
	const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

	const toggleStep = (stepIndex: number) => {
		setCompletedSteps((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(stepIndex)) {
				newSet.delete(stepIndex);
			} else {
				newSet.add(stepIndex);
			}
			return newSet;
		});
	};

	const childrenWithIndex = React.Children.map(children, (child, index) => {
		if (React.isValidElement(child)) {
			return React.cloneElement(child, { index } as never);
		}
		return child;
	});

	return (
		<StepsContext.Provider value={{ completedSteps, toggleStep, interactive }}>
			<div
				className={cn(
					"steps [&>div]:first:!mt-0 mb-12 [counter-reset:step]",
					className
				)}
				{...props}
			>
				{childrenWithIndex}
			</div>
		</StepsContext.Provider>
	);
};
