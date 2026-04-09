"use client";

import type * as React from "react";
import { useSupportMode } from "../context/mode";
import { TriggerRefProvider } from "../context/positioning";
import { cn } from "../utils";

export type RootProps = {
	className?: string;
	children: React.ReactNode;
};

/**
 * Root wrapper component that provides the positioning context.
 * Contains the trigger and content as siblings.
 *
 * @example
 * <Support.Root>
 *   <Support.Trigger>Help</Support.Trigger>
 *   <Support.Content>
 *     <Support.Router />
 *   </Support.Content>
 * </Support.Root>
 */
export const Root: React.FC<RootProps> = ({ className, children }) => {
	const mode = useSupportMode();

	return (
		<TriggerRefProvider>
			<div
				className={cn(
					"cossistant co-animate-fade-in relative",
					mode === "responsive" && "h-full min-h-0 w-full",
					className
				)}
				data-support-mode={mode}
			>
				{children}
			</div>
		</TriggerRefProvider>
	);
};
