"use client";

import type * as React from "react";
import { cn } from "../../support/utils";
import { TriggerRefProvider } from "../context/positioning";
import { useFeedbackConfig } from "../context/widget";

export type RootProps = {
	className?: string;
	children: React.ReactNode;
};

export const Root: React.FC<RootProps> = ({ className, children }) => {
	const { isOpen } = useFeedbackConfig();

	return (
		<TriggerRefProvider>
			<div
				className={cn("cossistant co-animate-fade-in relative", className)}
				data-cossistant-feedback-root=""
				data-feedback-root="true"
				data-slot="feedback-root"
				data-state={isOpen ? "open" : "closed"}
			>
				{children}
			</div>
		</TriggerRefProvider>
	);
};
