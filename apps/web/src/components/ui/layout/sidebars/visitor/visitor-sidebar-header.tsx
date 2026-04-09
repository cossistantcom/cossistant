import type { RouterOutputs } from "@api/trpc/types";
import type { VisitorPresenceEntry } from "@plasma/types";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { VisitorSourceBadge } from "@/components/ui/visitor-source-badge";
import { cn } from "@/lib/utils";

export type VisitorSidebarHeaderProps = {
	fullName: string;
	email?: string | null;
	avatarUrl?: string | null;
	lastSeenAt?: string | null;
	status?: VisitorPresenceEntry["status"];
	contact?: NonNullable<
		RouterOutputs["conversation"]["getVisitorById"]
	>["contact"];
	attribution?: NonNullable<
		RouterOutputs["conversation"]["getVisitorById"]
	>["attribution"];
	onOpenDetail?: () => void;
	onOpenDetailPrefetch?: () => void;
};

export function VisitorSidebarHeader({
	fullName,
	email,
	avatarUrl,
	lastSeenAt,
	status,
	contact,
	attribution,
	onOpenDetail,
	onOpenDetailPrefetch,
}: VisitorSidebarHeaderProps) {
	const headerContent = (
		<>
			<Avatar
				fallbackName={fullName}
				lastOnlineAt={lastSeenAt}
				status={status}
				url={avatarUrl}
			/>
			<div className="flex flex-col gap-0 text-left">
				<div className="flex flex-wrap items-center gap-2">
					<p className="font-medium text-sm">{fullName}</p>
					{/* <VisitorSourceBadge attribution={attribution} /> */}
				</div>
				{contact ? (
					<p className="text-muted-foreground text-xs">{email}</p>
				) : (
					<p className="text-primary/50 text-xs decoration-dashed underline-offset-2">
						Not identified yet
					</p>
				)}
			</div>
		</>
	);

	if (onOpenDetail) {
		return (
			<div className="flex h-10 w-full items-center justify-between">
				<button
					className={cn(
						"flex w-full items-center gap-3 rounded-lg px-2 py-1.5 transition-colors",
						"hover:bg-background-200 dark:hover:bg-background-300"
					)}
					onClick={onOpenDetail}
					onFocus={onOpenDetailPrefetch}
					onMouseEnter={onOpenDetailPrefetch}
					type="button"
				>
					{headerContent}
				</button>
			</div>
		);
	}

	if (contact) {
		return (
			<div className="flex h-10 w-full items-center justify-between px-2 py-1.5">
				<div className="flex w-full items-center gap-3">{headerContent}</div>
			</div>
		);
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<div className="flex h-10 w-full items-center justify-between">
					<button
						className={cn(
							"flex w-full items-center gap-3 rounded-lg px-2 py-1.5 transition-colors",
							"hover:bg-background-200 dark:hover:bg-background-300"
						)}
						type="button"
					>
						{headerContent}
					</button>
				</div>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64">
				<div className="flex flex-col gap-3">
					<p className="text-sm">No contact associated to this visitor yet.</p>
					<Button asChild size="sm" variant="outline">
						<Link href="/docs/concepts/contacts">Learn about contacts</Link>
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
