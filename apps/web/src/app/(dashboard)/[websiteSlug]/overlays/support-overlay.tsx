"use client";

import {
	Support,
	Button as SupportButton,
	type SupportHeaderSlotProps,
} from "@cossistant/next/support";
import Icon from "@/components/ui/icons";
import { useSupportOverlayState } from "@/hooks/use-support-overlay-state";
import { cn } from "@/lib/utils";
import { DashboardOverlayShell } from "./dashboard-overlay-shell";

type SupportOverlayHeaderProps = SupportHeaderSlotProps;

function SupportOverlayHeader({
	actions,
	children,
	className,
	onGoBack,
	page,
}: SupportOverlayHeaderProps) {
	return (
		<div
			className={cn("absolute inset-x-0 top-0 z-10 h-18", className)}
			data-page={page}
			data-slot="header"
		>
			<div className="absolute inset-0 z-10 flex items-center justify-between gap-3 px-4">
				<div className="flex flex-1 items-center gap-3">
					{onGoBack ? (
						<SupportButton
							aria-label="Go back"
							onClick={onGoBack}
							size="icon"
							type="button"
							variant="ghost"
						>
							<Icon className="size-4" name="arrow-left" />
						</SupportButton>
					) : null}
					{children}
				</div>
				{actions ? (
					<div className="flex items-center gap-2">{actions}</div>
				) : null}
			</div>
		</div>
	);
}

export function SupportOverlay() {
	const { isOpen } = useSupportOverlayState();

	if (!isOpen) {
		return null;
	}

	return (
		<DashboardOverlayShell
			className="bg-background dark:bg-background"
			dataSlot="support-overlay"
		>
			<div className="flex h-full w-full items-center justify-center px-2 pt-1 pb-2 lg:px-6 lg:py-6">
				<div
					className="h-full min-h-0 w-full max-w-[480px] overflow-hidden rounded bg-background shadow-xl dark:bg-background-50"
					data-slot="support-overlay-panel"
				>
					<Support
						mode="responsive"
						slotProps={{
							content: {
								className: "border-0 shadow-none",
							},
						}}
						slots={{
							header: (props) => <SupportOverlayHeader {...props} />,
						}}
					/>
				</div>
			</div>
		</DashboardOverlayShell>
	);
}
