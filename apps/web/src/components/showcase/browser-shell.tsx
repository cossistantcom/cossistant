import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BrowserShellProps = {
	children?: ReactNode;
	chromeUrl?: string;
	className?: string;
	contentClassName?: string;
};

const DEFAULT_CHROME_URL = "https://plasma-pandora.com/shadcn/inbox";

export function BrowserShell({
	children,
	chromeUrl = DEFAULT_CHROME_URL,
	className,
	contentClassName,
}: BrowserShellProps) {
	return (
		<div
			className={cn(
				"overflow-hidden border shadow-2xl dark:shadow-primary/5",
				className
			)}
			data-slot="browser-shell"
		>
			<div className="flex h-full w-full flex-col overflow-hidden bg-background dark:bg-background-100">
				<div className="flex items-center justify-between gap-2 border-primary/5 border-b px-4 py-1">
					<div
						className="flex w-20 gap-2"
						data-slot="browser-shell-traffic-lights"
					>
						<div className="size-2.5 rounded-full bg-red-500" />
						<div className="size-2.5 rounded-full bg-yellow-500" />
						<div className="size-2.5 rounded-full bg-green-500" />
					</div>
					<div className="ml-4 flex flex-1 items-center justify-center gap-2 px-3 py-0.5">
						<span
							className="max-w-full truncate rounded bg-background-400 px-2 py-0.5 text-primary/60 text-xs"
							data-slot="browser-shell-url"
						>
							{chromeUrl}
						</span>
					</div>
					<div className="w-20" />
				</div>
				<div
					className={cn("flex-1 bg-background", contentClassName)}
					data-slot="browser-shell-content"
				>
					{children}
				</div>
			</div>
		</div>
	);
}
