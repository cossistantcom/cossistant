import type { ContactVisitorSummary } from "@plasma/types";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
	ValueDisplay,
	ValueGroup,
} from "@/components/ui/layout/sidebars/shared";

type ContactVisitorsListProps = {
	visitors: ContactVisitorSummary[];
};

export function ContactVisitorsList({ visitors }: ContactVisitorsListProps) {
	if (visitors.length === 0) {
		return (
			<ValueGroup header="Associated visitors">
				<p className="text-primary/60 text-xs">
					This contact is not linked to any visitors yet.
				</p>
			</ValueGroup>
		);
	}

	return (
		<ValueGroup
			className="gap-4"
			header={`Associated visitors (${visitors.length})`}
		>
			{visitors.map((visitor) => (
				<div
					className="flex flex-col gap-2 rounded-sm bg-background-200 p-2"
					key={visitor.id}
				>
					<div
						className="flex flex-col gap-2 border-b pb-3 last:border-b-0"
						key={visitor.id}
					>
						<div className="flex items-center justify-between gap-2 pl-2">
							<span className="font-medium text-xs">{visitor.id}</span>
							<Badge
								className="text-[10px]"
								variant={visitor.isBlocked ? "destructive" : "success"}
							>
								{visitor.isBlocked ? "Blocked" : "Active"}
							</Badge>
						</div>
						<div className="flex flex-col gap-1.5">
							{visitor.lastSeenAt && (
								<ValueDisplay
									title="Last seen"
									value={formatDistanceToNow(new Date(visitor.lastSeenAt), {
										addSuffix: true,
									})}
								/>
							)}
							{(visitor.city || visitor.country) && (
								<ValueDisplay
									title="Location"
									value={[visitor.city, visitor.country]
										.filter(Boolean)
										.join(", ")}
								/>
							)}
							{visitor.device && (
								<ValueDisplay title="Device" value={visitor.device} />
							)}
							{visitor.browser && (
								<ValueDisplay title="Browser" value={visitor.browser} />
							)}
							{visitor.language && (
								<ValueDisplay title="Language" value={visitor.language} />
							)}
							<ValueDisplay
								title="First seen"
								value={formatDistanceToNow(new Date(visitor.createdAt), {
									addSuffix: true,
								})}
							/>
							{visitor.isBlocked && visitor.blockedAt && (
								<ValueDisplay
									className="text-destructive"
									title="Blocked"
									value={formatDistanceToNow(new Date(visitor.blockedAt), {
										addSuffix: true,
									})}
								/>
							)}
						</div>
					</div>
				</div>
			))}
		</ValueGroup>
	);
}
