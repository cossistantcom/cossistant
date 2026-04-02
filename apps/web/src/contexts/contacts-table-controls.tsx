"use client";

import type { ContactListVisitorStatus } from "@plasma/types";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";

import { useContactVisitorDetailState } from "@/hooks/use-contact-visitor-detail-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const CONTACTS_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type ContactSortField =
	| "name"
	| "email"
	| "createdAt"
	| "updatedAt"
	| "visitorCount"
	| "lastSeenAt";

type SortingUpdater = Parameters<OnChangeFn<SortingState>>[0];

type ContactsTableControlsValue = {
	page: number;
	setPage: (page: number) => void;
	pageSize: number;
	setPageSize: (pageSize: number) => void;
	searchTerm: string;
	setSearchTerm: (term: string) => void;
	debouncedSearchTerm: string;
	sorting: SortingState;
	setSorting: (updater: SortingUpdater) => void;
	visitorStatus: ContactListVisitorStatus;
	setVisitorStatus: (status: ContactListVisitorStatus) => void;
	selectedContactId: string | null;
	setSelectedContactId: (contactId: string | null) => void;
	closeDetailPage: () => void;
	isDetailPageOpen: boolean;
};

const DEFAULT_SORTING: SortingState = [{ id: "updatedAt", desc: true }];
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PAGE = 1;

const SORT_FIELDS: ContactSortField[] = [
	"name",
	"email",
	"createdAt",
	"updatedAt",
	"visitorCount",
	"lastSeenAt",
];

const SORT_ORDERS = ["asc", "desc"] as const;

const VISITOR_STATUSES: ContactListVisitorStatus[] = [
	"all",
	"withVisitors",
	"withoutVisitors",
];

type PageSizeOption = (typeof CONTACTS_PAGE_SIZE_OPTIONS)[number];

function isPageSizeOption(value: number): value is PageSizeOption {
	return CONTACTS_PAGE_SIZE_OPTIONS.includes(value as PageSizeOption);
}

function isSortField(
	value: string | null | undefined
): value is ContactSortField {
	return value ? SORT_FIELDS.includes(value as ContactSortField) : false;
}

function isSortOrder(
	value: string | null | undefined
): value is "asc" | "desc" {
	return value
		? SORT_ORDERS.includes(value as (typeof SORT_ORDERS)[number])
		: false;
}

function isVisitorStatus(
	value: string | null | undefined
): value is ContactListVisitorStatus {
	return value
		? VISITOR_STATUSES.includes(value as ContactListVisitorStatus)
		: false;
}

function normalizePositiveInteger(
	value: number | null | undefined,
	fallback: number
) {
	if (!Number.isFinite(value)) {
		return fallback;
	}

	const floored = Math.floor(value ?? fallback);
	return floored > 0 ? floored : fallback;
}

export function useContactsTableControls(): ContactsTableControlsValue {
	const [pageParam, setPageParam] = useQueryState(
		"page",
		parseAsInteger.withDefault(DEFAULT_PAGE)
	);
	const page = normalizePositiveInteger(pageParam, DEFAULT_PAGE);

	const [pageSizeParam, setPageSizeParam] = useQueryState(
		"limit",
		parseAsInteger.withDefault(DEFAULT_PAGE_SIZE)
	);
	const pageSize = isPageSizeOption(pageSizeParam)
		? pageSizeParam
		: DEFAULT_PAGE_SIZE;

	const [searchParam, setSearchParam] = useQueryState(
		"search",
		parseAsString.withDefault("")
	);
	const searchTerm = searchParam ?? "";
	const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), 300);

	const defaultSortField = DEFAULT_SORTING[0]?.id as ContactSortField;

	const [sortFieldParam, setSortFieldParam] = useQueryState(
		"sortBy",
		parseAsString.withDefault(defaultSortField)
	);
	const sortField = isSortField(sortFieldParam)
		? sortFieldParam
		: defaultSortField;

	const [sortOrderParam, setSortOrderParam] = useQueryState(
		"sortOrder",
		parseAsString.withDefault("desc")
	);
	const sortOrder = isSortOrder(sortOrderParam) ? sortOrderParam : "desc";

	const [visitorStatusParam, setVisitorStatusParam] = useQueryState(
		"visitorStatus",
		parseAsString.withDefault("all")
	);
	const visitorStatus = isVisitorStatus(visitorStatusParam)
		? visitorStatusParam
		: "all";

	const {
		closeDetailPage,
		contactId: selectedContactId,
		openContactDetail,
		visitorId,
	} = useContactVisitorDetailState();
	const isDetailPageOpen = selectedContactId !== null || visitorId !== null;

	const sorting = useMemo<SortingState>(
		() => [{ id: sortField, desc: sortOrder === "desc" }],
		[sortField, sortOrder]
	);

	const setPage = useCallback(
		(nextPage: number) => {
			const normalized = normalizePositiveInteger(nextPage, DEFAULT_PAGE);

			void setPageParam(normalized <= DEFAULT_PAGE ? null : normalized);
		},
		[setPageParam]
	);

	const setPageSize = useCallback(
		(nextSize: number) => {
			const normalized = isPageSizeOption(nextSize)
				? nextSize
				: DEFAULT_PAGE_SIZE;

			void setPageSizeParam(
				normalized === DEFAULT_PAGE_SIZE ? null : normalized
			);
			void setPageParam(null);
		},
		[setPageParam, setPageSizeParam]
	);

	const setSearchTerm = useCallback(
		(value: string) => {
			const trimmed = value.trim();
			void setSearchParam(trimmed.length === 0 ? null : value);
			void setPageParam(null);
		},
		[setPageParam, setSearchParam]
	);

	const setSorting = useCallback(
		(updater: SortingUpdater) => {
			const next = typeof updater === "function" ? updater(sorting) : updater;
			const normalized = next.length > 0 ? next : DEFAULT_SORTING;
			const primary = normalized[0];

			if (!primary) {
				return;
			}

			const nextField = isSortField(String(primary.id))
				? (primary.id as ContactSortField)
				: defaultSortField;
			const nextOrder = primary.desc ? "desc" : "asc";

			void setSortFieldParam(nextField === defaultSortField ? null : nextField);
			void setSortOrderParam(nextOrder === "desc" ? null : nextOrder);
			void setPageParam(null);
		},
		[
			sorting,
			defaultSortField,
			setPageParam,
			setSortFieldParam,
			setSortOrderParam,
		]
	);

	const setVisitorStatus = useCallback(
		(status: ContactListVisitorStatus) => {
			const next = isVisitorStatus(status) ? status : "all";

			void setVisitorStatusParam(next === "all" ? null : next);
			void setPageParam(null);
		},
		[setPageParam, setVisitorStatusParam]
	);

	const setSelectedContactId = useCallback(
		(contactId: string | null) => {
			if (contactId) {
				void openContactDetail(contactId);
				return;
			}

			void closeDetailPage();
		},
		[closeDetailPage, openContactDetail]
	);

	return {
		page,
		setPage,
		pageSize,
		setPageSize,
		searchTerm,
		setSearchTerm,
		debouncedSearchTerm,
		sorting,
		setSorting,
		visitorStatus,
		setVisitorStatus,
		selectedContactId,
		setSelectedContactId,
		closeDetailPage: () => {
			void closeDetailPage();
		},
		isDetailPageOpen,
	};
}
