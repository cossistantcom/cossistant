import { ToolActivityRow } from "@plasma/next/primitives";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ToolCallState } from "./types";

export type ActivityIcon =
	| { type: "logo" }
	| { type: "spinner" }
	| { type: "avatar"; name: string; image?: string | null }
	| {
			type: "icon";
			Icon: LucideIcon;
			iconKey: string;
	  }
	| { type: "custom"; content: React.ReactNode };

function ActivityIconRenderer({ icon }: { icon: ActivityIcon }) {
	switch (icon.type) {
		case "spinner":
			return (
				<div className="flex size-5 shrink-0 items-center justify-center">
					<Spinner className="size-4" size={20} />
				</div>
			);
		case "avatar":
			return (
				<Avatar
					className="size-5 shrink-0 overflow-clip"
					fallbackName={icon.name}
					url={icon.image}
				/>
			);
		case "icon": {
			const Icon = icon.Icon;
			return (
				<div className="flex size-5 shrink-0 items-center justify-center">
					<Icon
						aria-hidden
						className="size-4 text-muted-foreground"
						data-activity-icon={icon.iconKey}
					/>
				</div>
			);
		}
		case "custom":
			return <>{icon.content}</>;
		default:
			return (
				<div className="flex size-5 shrink-0 items-center justify-center">
					<Logo className="size-4 text-primary/90" />
				</div>
			);
	}
}

function resolveIcon(
	icon: ActivityIcon | undefined,
	state?: ToolCallState
): ActivityIcon {
	if (icon) {
		return icon;
	}
	if (state === "partial") {
		return { type: "spinner" };
	}
	return { type: "logo" };
}

export function ActivityWrapper({
	state,
	text,
	timestamp,
	icon,
	showIcon = true,
	showStateIndicator = false,
	showTerminalIndicator = true,
	className,
	children,
}: {
	state: ToolCallState;
	text: React.ReactNode;
	timestamp: string;
	icon?: ActivityIcon;
	showIcon?: boolean;
	showStateIndicator?: boolean;
	showTerminalIndicator?: boolean;
	className?: string;
	children?: React.ReactNode;
}) {
	const isError = state === "error";
	const resolvedIcon = resolveIcon(icon, state);
	const leading = showIcon ? (
		<ActivityIconRenderer icon={resolvedIcon} />
	) : null;
	const shouldShowIndicator = showStateIndicator || showTerminalIndicator;

	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className={cn("w-full", className)}
			initial={{ opacity: 0, y: 6 }}
			transition={{ duration: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
		>
			<ToolActivityRow
				className="group/activity"
				details={children}
				leading={leading}
				showIndicator={shouldShowIndicator}
				showTerminalIndicator={showTerminalIndicator}
				spinnerClassName="text-primary/70"
				state={state}
				text={text}
				textClassName={isError ? "text-destructive/70" : undefined}
				timestamp={`[${timestamp}]`}
				tone="dashboard"
			/>
		</motion.div>
	);
}
