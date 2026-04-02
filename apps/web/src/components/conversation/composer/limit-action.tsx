"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";

export type LimitActionProps = {
	onUpgradeClick: () => void;
	used: number;
	limit: number | null;
	windowDays: number;
	/**
	 * Called when the container height changes (for dynamic timeline padding).
	 */
	onHeightChange?: (height: number) => void;
};

export const LimitAction: React.FC<LimitActionProps> = ({
	onUpgradeClick,
	used,
	limit,
	windowDays,
	onHeightChange,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (containerRef.current && onHeightChange) {
			const height = containerRef.current.getBoundingClientRect().height;
			onHeightChange(height);
		}
	}, [onHeightChange]);

	return (
		<div
			className="absolute right-0 bottom-4 left-0 z-10 mx-auto w-full bg-background px-4 xl:max-w-xl xl:px-0 2xl:max-w-2xl"
			ref={containerRef}
		>
			<div className="flex flex-col gap-3 rounded border border-plasma-orange/50 border-dashed bg-plasma-orange/5 p-4">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded bg-plasma-orange/20">
						<Icon className="h-4 w-4 text-plasma-orange" name="lock" />
					</div>
					<div className="font-medium text-sm">Message limit reached</div>
				</div>

				<div className="text-muted-foreground text-sm">
					{limit === null
						? `Your message hard limit was reached in the last ${windowDays} days.`
						: `You've used ${used.toLocaleString()} / ${limit.toLocaleString()} messages in the last ${windowDays} days.`}
				</div>

				<div className="flex items-center justify-end">
					<Button
						className="bg-plasma-orange hover:bg-plasma-orange/90"
						onClick={onUpgradeClick}
						type="button"
					>
						Upgrade plan
					</Button>
				</div>
			</div>
		</div>
	);
};
