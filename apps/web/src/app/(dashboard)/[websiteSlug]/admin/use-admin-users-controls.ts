"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export type AdminView = "users" | "websites";

export function useAdminUsersControls() {
	const [adminViewParam, setAdminViewParam] = useQueryState(
		"adminView",
		parseAsString.withDefault("users")
	);
	const [searchParam, setSearchParam] = useQueryState(
		"search",
		parseAsString.withDefault("")
	);
	const adminView: AdminView =
		adminViewParam === "websites" ? "websites" : "users";
	const searchTerm = searchParam ?? "";
	const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), 300);

	const setAdminView = useCallback(
		(value: AdminView) => {
			void setAdminViewParam(value === "users" ? null : value);
		},
		[setAdminViewParam]
	);

	const setSearchTerm = useCallback(
		(value: string) => {
			void setSearchParam(value.trim().length === 0 ? null : value);
		},
		[setSearchParam]
	);

	return {
		adminView,
		searchTerm,
		setAdminView,
		setSearchTerm,
		debouncedSearchTerm,
	};
}
