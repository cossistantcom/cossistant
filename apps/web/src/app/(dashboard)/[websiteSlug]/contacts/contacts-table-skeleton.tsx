import { ArrowUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

const LOADING_ROW_COUNT = 5;

/**
 * Fixed column widths for the contacts table.
 * Keys match the accessorKey values in the column definitions.
 * Shared between the skeleton and the actual table for consistency.
 */
export const CONTACTS_TABLE_COLUMN_WIDTHS = {
	name: "w-[240px] min-w-[240px]",
	email: "w-[220px] min-w-[220px]",
	contactOrganizationName: "w-[180px] min-w-[180px]",
	visitorCount: "w-[100px] min-w-[100px]",
	lastSeenAt: "w-[130px] min-w-[130px]",
	updatedAt: "w-[130px] min-w-[130px]",
	actions: "w-[48px] min-w-[48px]",
} as const;

/**
 * A single skeleton row that matches the contacts table column structure.
 * Used for inline loading states within the table.
 */
export function ContactTableSkeletonRow() {
	return (
		<TableRow className="border-transparent border-b-0">
			{/* Name: Avatar + text */}
			<TableCell className={`py-2 ${CONTACTS_TABLE_COLUMN_WIDTHS.name}`}>
				<div className="flex items-center gap-3">
					<Skeleton className="size-8 rounded-[20%]" />
					<Skeleton className="h-4 w-[120px]" />
				</div>
			</TableCell>
			{/* Email */}
			<TableCell className={`py-2 ${CONTACTS_TABLE_COLUMN_WIDTHS.email}`}>
				<Skeleton className="h-4 w-[150px]" />
			</TableCell>
			{/* Company: Icon + text */}
			<TableCell
				className={`py-2 ${CONTACTS_TABLE_COLUMN_WIDTHS.contactOrganizationName}`}
			>
				<div className="flex items-center gap-2">
					<Skeleton className="size-3.5 rounded-sm" />
					<Skeleton className="h-4 w-[100px]" />
				</div>
			</TableCell>
			{/* Visitors badge */}
			<TableCell
				className={`py-2 ${CONTACTS_TABLE_COLUMN_WIDTHS.visitorCount}`}
			>
				<Skeleton className="h-5 w-8 rounded-full" />
			</TableCell>
			{/* Last Seen */}
			<TableCell className={`py-2 ${CONTACTS_TABLE_COLUMN_WIDTHS.lastSeenAt}`}>
				<Skeleton className="h-4 w-[80px]" />
			</TableCell>
			{/* Updated */}
			<TableCell className={`py-2 ${CONTACTS_TABLE_COLUMN_WIDTHS.updatedAt}`}>
				<Skeleton className="h-4 w-[90px]" />
			</TableCell>
			{/* Actions */}
			<TableCell className={`py-2 ${CONTACTS_TABLE_COLUMN_WIDTHS.actions}`}>
				<Skeleton className="ml-auto size-6 rounded-md" />
			</TableCell>
		</TableRow>
	);
}

type ContactsTableSkeletonProps = {
	rowCount?: number;
};

/**
 * Full table skeleton with headers and skeleton rows.
 * Used for route-level loading states.
 */
export function ContactsTableSkeleton({
	rowCount = LOADING_ROW_COUNT,
}: ContactsTableSkeletonProps) {
	return (
		<div className="mt-2 overflow-auto px-2">
			<Table className="min-w-[1048px]">
				<TableHeader className="border-transparent border-b-0">
					<TableRow className="border-transparent border-b-0">
						<TableHead className={CONTACTS_TABLE_COLUMN_WIDTHS.name}>
							<span className="inline-flex items-center gap-1 font-medium text-primary/80 text-sm">
								Name
								<ArrowUpDown className="h-3.5 w-3.5" />
							</span>
						</TableHead>
						<TableHead className={CONTACTS_TABLE_COLUMN_WIDTHS.email}>
							<span className="inline-flex items-center gap-1 font-medium text-primary/80 text-sm">
								Email
								<ArrowUpDown className="h-3.5 w-3.5" />
							</span>
						</TableHead>
						<TableHead
							className={CONTACTS_TABLE_COLUMN_WIDTHS.contactOrganizationName}
						>
							<span className="inline-flex items-center gap-1 font-medium text-primary/80 text-sm">
								Company
								<ArrowUpDown className="h-3.5 w-3.5" />
							</span>
						</TableHead>
						<TableHead className={CONTACTS_TABLE_COLUMN_WIDTHS.visitorCount}>
							<span className="inline-flex items-center gap-1 font-medium text-primary/80 text-sm">
								Visitors
								<ArrowUpDown className="h-3.5 w-3.5" />
							</span>
						</TableHead>
						<TableHead className={CONTACTS_TABLE_COLUMN_WIDTHS.lastSeenAt}>
							<span className="inline-flex items-center gap-1 font-medium text-primary/80 text-sm">
								Last Seen
								<ArrowUpDown className="h-3.5 w-3.5" />
							</span>
						</TableHead>
						<TableHead className={CONTACTS_TABLE_COLUMN_WIDTHS.updatedAt}>
							<span className="inline-flex items-center gap-1 font-medium text-primary/80 text-sm">
								Updated
								<ArrowUpDown className="h-3.5 w-3.5" />
							</span>
						</TableHead>
						<TableHead className={CONTACTS_TABLE_COLUMN_WIDTHS.actions}>
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{Array.from({ length: rowCount }, (_, index) => (
						<ContactTableSkeletonRow key={index} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}
