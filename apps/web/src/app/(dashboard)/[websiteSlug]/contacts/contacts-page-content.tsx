/** biome-ignore-all lint/correctness/useExhaustiveDependencies: ok */
"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { useQuery } from "@tanstack/react-query";
import {
	type Column,
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	type OnChangeFn,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, PageHeaderTitle } from "@/components/ui/layout";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { TooltipOnHover } from "@/components/ui/tooltip";
import {
	type ContactSortField,
	useContactsTableControls,
} from "@/contexts/contacts-table-controls";
import { useVisitorPresence } from "@/contexts/visitor-presence";
import { usePrefetchContactVisitorDetail } from "@/data/use-prefetch-contact-visitor-detail";
import { formatFullDateTime, formatLastSeenAt } from "@/lib/date";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
	CONTACTS_TABLE_COLUMN_WIDTHS,
	ContactTableSkeletonRow,
} from "./contacts-table-skeleton";
import { useContactsKeyboardNavigation } from "./use-contacts-keyboard-navigation";

type ContactsPageContentProps = {
	websiteSlug: string;
};

type ContactRow = RouterOutputs["contact"]["list"]["items"][number];

const ITEM_HEIGHT = 52;

export function ContactsPageContent({ websiteSlug }: ContactsPageContentProps) {
	const trpc = useTRPC();
	const tableContainerRef = useRef<HTMLDivElement>(null);
	const {
		searchTerm,
		setSearchTerm,
		page,
		setPage,
		pageSize,
		debouncedSearchTerm,
		sorting,
		setSorting,
		visitorStatus,
		closeDetailPage,
		isDetailPageOpen,
		selectedContactId,
		setSelectedContactId,
	} = useContactsTableControls();

	const activeSort = sorting[0];
	const sortBy = activeSort?.id as ContactSortField | undefined;
	const sortOrder = activeSort ? (activeSort.desc ? "desc" : "asc") : undefined;

	const listQuery = useQuery({
		...trpc.contact.list.queryOptions({
			websiteSlug,
			page,
			limit: pageSize,
			search: debouncedSearchTerm || undefined,
			sortBy,
			sortOrder,
			visitorStatus,
		}),
	});

	const contacts = listQuery.data?.items ?? [];
	const totalCount = listQuery.data?.totalCount ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

	const handleSelectContact = useCallback(
		(contactId: string) => {
			setSelectedContactId(contactId);
		},
		[setSelectedContactId]
	);

	const handleCloseDetailPage = useCallback(() => {
		closeDetailPage();
	}, [closeDetailPage]);
	const { prefetchDetail } = usePrefetchContactVisitorDetail({ websiteSlug });

	const { focusedIndex, handleMouseEnter } = useContactsKeyboardNavigation({
		contacts,
		parentRef: tableContainerRef,
		itemHeight: ITEM_HEIGHT,
		enabled: !listQuery.isLoading,
		onSelectContact: handleSelectContact,
		onCloseDetailPage: handleCloseDetailPage,
		isDetailPageOpen,
		selectedContactId,
	});

	useEffect(() => {
		if (page > totalPages) {
			setPage(totalPages);
		}
	}, [page, totalPages]);

	const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
		setSorting(updater);
	};

	const handleRowPrefetch = useCallback(
		(contactId: string, index: number) => {
			handleMouseEnter(index);
			void prefetchDetail({
				type: "contact",
				id: contactId,
			});
		},
		[handleMouseEnter, prefetchDetail]
	);

	const handlePageChange = (nextPage: number) => {
		const cappedPage = Math.min(
			Math.max(nextPage, 1),
			Math.max(1, Math.ceil(totalCount / pageSize))
		);
		setPage(cappedPage);
	};

	const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
	const pageEnd = totalCount === 0 ? 0 : Math.min(totalCount, page * pageSize);

	return (
		<Page className="relative flex flex-col gap-6">
			<PageHeader className="bg-transparent dark:bg-transparent">
				<PageHeaderTitle>Contacts</PageHeaderTitle>
			</PageHeader>

			<ScrollArea
				className="h-full px-4 pt-14 pb-32"
				maskHeight="150px"
				orientation="both"
				ref={tableContainerRef}
				scrollMask
			>
				<ContactsTable
					data={contacts}
					focusedIndex={focusedIndex}
					isLoading={listQuery.isLoading}
					onRowClick={handleSelectContact}
					onRowPrefetch={handleRowPrefetch}
					onSortingChange={handleSortingChange}
					selectedContactId={selectedContactId}
					sorting={sorting}
				/>
			</ScrollArea>
			<div className="absolute right-0 bottom-0 left-0 flex h-14 w-full items-center justify-between gap-2 pr-3 pl-4">
				<div className="text-muted-foreground text-sm">
					{totalCount === 0
						? "No contacts to display"
						: `Showing ${pageStart}-${pageEnd} of ${totalCount} contacts`}
				</div>
				<div className="flex items-center gap-2">
					<Button
						disabled={page <= 1 || listQuery.isFetching}
						onClick={() => handlePageChange(page - 1)}
						size="sm"
						variant="outline"
					>
						Previous
					</Button>
					<span className="font-medium text-sm">
						{page} / {totalPages}
					</span>
					<Button
						disabled={page >= totalPages || listQuery.isFetching}
						onClick={() => handlePageChange(page + 1)}
						size="sm"
						variant="outline"
					>
						Next
					</Button>
				</div>
			</div>
		</Page>
	);
}

type ContactsTableProps = {
	data: ContactRow[];
	isLoading: boolean;
	sorting: SortingState;
	onSortingChange: OnChangeFn<SortingState>;
	onRowClick: (contactId: string) => void;
	onRowPrefetch: (contactId: string, index: number) => void;
	focusedIndex: number;
	selectedContactId: string | null;
};

const LOADING_ROW_COUNT = 5;

export function ContactsTable({
	data,
	isLoading,
	sorting,
	onSortingChange,
	onRowClick,
	onRowPrefetch,
	focusedIndex,
	selectedContactId,
}: ContactsTableProps) {
	const { visitors: presenceVisitors } = useVisitorPresence();

	const presenceByContactId = useMemo(() => {
		const map = new Map<
			string,
			{
				status: "online" | "away";
				lastSeenAt: string;
				image: string | null;
			}
		>();
		const timestamps = new Map<string, number>();

		for (const visitor of presenceVisitors) {
			const contactId = visitor.contactId;

			if (!contactId) {
				continue;
			}

			if (!visitor.lastSeenAt) {
				continue;
			}

			const parsedLastSeen = Date.parse(visitor.lastSeenAt);

			if (Number.isNaN(parsedLastSeen)) {
				continue;
			}

			const existing = map.get(contactId);
			const existingTimestamp = timestamps.get(contactId);
			const candidate = {
				status: visitor.status,
				lastSeenAt: visitor.lastSeenAt,
				image: visitor.image ?? null,
			};

			if (!existing) {
				map.set(contactId, candidate);
				timestamps.set(contactId, parsedLastSeen);
				continue;
			}

			if (candidate.status === "online" && existing.status !== "online") {
				map.set(contactId, candidate);
				timestamps.set(contactId, parsedLastSeen);
				continue;
			}

			if (existing.status === "online" && candidate.status !== "online") {
				continue;
			}

			if (
				existingTimestamp === undefined ||
				parsedLastSeen > existingTimestamp
			) {
				map.set(contactId, candidate);
				timestamps.set(contactId, parsedLastSeen);
			}
		}

		return map;
	}, [presenceVisitors]);

	const columns = useMemo<ColumnDef<ContactRow>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => <SortableHeader column={column} title="Name" />,
				cell: ({ row }) => {
					const { id, name, image } = row.original;
					const presence = presenceByContactId.get(id);
					const avatarUrl = image ?? presence?.image ?? null;
					const lastSeenAt =
						presence?.lastSeenAt ?? row.original.lastSeenAt ?? null;

					return (
						<div className="flex items-center gap-3">
							<Avatar
								className="size-8"
								fallbackName={name ?? "Contact"}
								lastOnlineAt={lastSeenAt}
								status={presence?.status}
								url={avatarUrl}
							/>
							{name ? (
								<span className="min-w-[120px] max-w-[200px] truncate font-medium text-sm">
									{name}
								</span>
							) : (
								<span className="text-muted-foreground/50 text-sm">None</span>
							)}
						</div>
					);
				},
			},
			{
				accessorKey: "email",
				header: ({ column }) => (
					<SortableHeader column={column} title="Email" />
				),
				cell: ({ row }) => {
					const email = row.original.email;
					if (!email) {
						return (
							<span className="text-muted-foreground/50 text-sm">None</span>
						);
					}
					return (
						<span className="max-w-[200px] truncate text-sm">{email}</span>
					);
				},
			},
			{
				accessorKey: "contactOrganizationName",
				header: ({ column }) => (
					<SortableHeader column={column} title="Company" />
				),
				cell: ({ row }) => {
					const orgName = row.original.contactOrganizationName;
					if (!orgName) {
						return (
							<span className="text-muted-foreground/50 text-sm">None</span>
						);
					}
					return (
						<div className="flex items-center gap-2">
							<Building2 className="size-3.5 text-muted-foreground" />
							<span className="truncate text-sm">{orgName}</span>
						</div>
					);
				},
			},
			{
				accessorKey: "visitorCount",
				header: ({ column }) => (
					<SortableHeader column={column} title="Visitors" />
				),
				cell: ({ row }) => (
					<Badge className="w-fit" variant="secondary">
						{row.original.visitorCount}
					</Badge>
				),
			},
			{
				accessorKey: "lastSeenAt",
				header: ({ column }) => (
					<SortableHeader column={column} title="Last Seen" />
				),
				cell: ({ row }) => {
					const { id, lastSeenAt: dbLastSeenAt } = row.original;
					const presence = presenceByContactId.get(id);
					const lastSeenAt = presence?.lastSeenAt ?? dbLastSeenAt;

					if (!lastSeenAt) {
						return (
							<span className="text-muted-foreground/50 text-sm">Never</span>
						);
					}

					const date = new Date(lastSeenAt);

					return (
						<TooltipOnHover content={formatFullDateTime(date)} delay={300}>
							<span className="cursor-default text-muted-foreground text-sm">
								{formatLastSeenAt(date)}
							</span>
						</TooltipOnHover>
					);
				},
			},
			{
				accessorKey: "updatedAt",
				header: ({ column }) => (
					<SortableHeader column={column} title="Updated" />
				),
				cell: ({ row }) => (
					<span className="text-muted-foreground text-sm">
						{formatDistanceToNow(new Date(row.original.updatedAt), {
							addSuffix: true,
						})}
					</span>
				),
			},
		],
		[presenceByContactId]
	);

	const table = useReactTable({
		data,
		columns,
		state: { sorting },
		onSortingChange,
		manualSorting: true,
		getCoreRowModel: getCoreRowModel(),
	});

	const headerGroups = table.getHeaderGroups();
	const rows = table.getRowModel().rows;

	if (rows.length === 0 && !isLoading) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 px-10 py-16 text-center">
				<div className="space-y-1">
					<h3 className="font-semibold text-base">
						No contacts match your filters
					</h3>
					<p className="text-muted-foreground text-sm">
						Try adjusting your search, filters, or sorting to find different
						contacts.
					</p>
				</div>
			</div>
		);
	}

	return (
		<Table className="min-w-[1000px]">
			<TableHeader className="border-transparent border-b-0">
				{headerGroups.map((headerGroup) => (
					<TableRow
						className="border-transparent border-b-0"
						key={headerGroup.id}
					>
						{headerGroup.headers.map((header) => {
							const sorted = header.column.getIsSorted();
							const columnWidthClass =
								CONTACTS_TABLE_COLUMN_WIDTHS[
									header.id as keyof typeof CONTACTS_TABLE_COLUMN_WIDTHS
								];

							return (
								<TableHead
									aria-sort={
										sorted === "desc"
											? "descending"
											: sorted === "asc"
												? "ascending"
												: "none"
									}
									className={columnWidthClass}
									key={header.id}
								>
									{header.isPlaceholder
										? null
										: flexRender(
												header.column.columnDef.header,
												header.getContext()
											)}
								</TableHead>
							);
						})}
					</TableRow>
				))}
			</TableHeader>
			<TableBody>
				{isLoading
					? Array.from({ length: LOADING_ROW_COUNT }, (_, index) => (
							<ContactTableSkeletonRow key={index} />
						))
					: rows.map((row, index) => {
							const isFocused = index === focusedIndex;
							const isSelected = row.original.id === selectedContactId;
							const cells = row.getVisibleCells();

							return (
								<TableRow
									className={cn(
										"cursor-pointer border-transparent border-b-0 transition-colors",
										"focus-visible:outline-none focus-visible:ring-0"
									)}
									key={row.id}
									onClick={() => onRowClick(row.original.id)}
									onFocus={() => onRowPrefetch(row.original.id, index)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											onRowClick(row.original.id);
										}
									}}
									onMouseEnter={() => onRowPrefetch(row.original.id, index)}
									tabIndex={isFocused ? 0 : -1}
								>
									{cells.map((cell, cellIndex) => {
										const isFirstCell = cellIndex === 0;
										const isLastCell = cellIndex === cells.length - 1;
										const columnWidthClass =
											CONTACTS_TABLE_COLUMN_WIDTHS[
												cell.column
													.id as keyof typeof CONTACTS_TABLE_COLUMN_WIDTHS
											];

										return (
											<TableCell
												className={cn(
													"py-2 transition-colors",
													columnWidthClass,
													isFirstCell && "rounded-l-lg",
													isLastCell && "rounded-r-lg",
													isFocused &&
														"bg-background-200 text-primary dark:bg-background-300",
													isSelected &&
														"bg-background-300 dark:bg-background-400"
												)}
												key={cell.id}
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext()
												)}
											</TableCell>
										);
									})}
								</TableRow>
							);
						})}
			</TableBody>
		</Table>
	);
}

type SortableHeaderProps<TData> = {
	column: Column<TData, unknown>;
	title: string;
};

function SortableHeader<TData>({ column, title }: SortableHeaderProps<TData>) {
	const sorted = column.getIsSorted();

	return (
		<button
			className="inline-flex items-center gap-1 font-medium text-primary/80 text-sm"
			onClick={() => column.toggleSorting(sorted === "asc")}
			type="button"
		>
			<span>{title}</span>
			{sorted === "asc" ? (
				<ArrowUp aria-hidden="true" className="h-3.5 w-3.5">
					<title>Sorted ascending</title>
				</ArrowUp>
			) : sorted === "desc" ? (
				<ArrowDown aria-hidden="true" className="h-3.5 w-3.5">
					<title>Sorted descending</title>
				</ArrowDown>
			) : (
				<ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5">
					<title>Sortable column</title>
				</ArrowUpDown>
			)}
		</button>
	);
}

export default ContactsPageContent;
