"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function useAdminUsersControls() {
	const [searchParam, setSearchParam] = useQueryState(
		"search",
		parseAsString.withDefault("")
	);
	const searchTerm = searchParam ?? "";
	const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), 300);

	const setSearchTerm = useCallback(
		(value: string) => {
			void setSearchParam(value.trim().length === 0 ? null : value);
		},
		[setSearchParam]
	);

	return {
		searchTerm,
		setSearchTerm,
		debouncedSearchTerm,
	};
}
