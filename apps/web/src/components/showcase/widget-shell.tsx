import SupportIcon from "@plasma/react/support/components/icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WidgetShellProps = {
	children?: ReactNode;
	className?: string;
	frameClassName?: string;
	bubble?: ReactNode;
};

export function WidgetShell({
	children,
	className,
	frameClassName,
	bubble,
}: WidgetShellProps) {
	return (
		<div
			className={cn("relative flex flex-col items-end gap-4", className)}
			data-slot="widget-shell"
		>
			<div
				className={cn(
					"relative flex flex-col overflow-hidden rounded border border-co-border bg-co-background shadow-2xl dark:shadow-primary/10",
					frameClassName
				)}
				data-slot="widget-shell-frame"
			>
				{children}
			</div>
			{bubble ?? <StaticWidgetBubble />}
		</div>
	);
}

export function StaticWidgetBubble({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"relative flex size-12 items-center justify-center rounded-full bg-co-primary/85 text-co-primary-foreground shadow-co-primary/20 shadow-lg",
				className
			)}
			data-slot="widget-shell-bubble"
		>
			<SupportIcon className="size-5" name="chat" variant="filled" />
		</div>
	);
}
