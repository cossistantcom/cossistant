"use client";

import { hasRole } from "@plasma/core";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";

type OrganizationRole = {
	role: string | null;
	isAdmin: boolean;
	isOwner: boolean;
	canCreateWebsite: boolean;
	isLoading: boolean;
};

export function useOrganizationRole(): OrganizationRole {
	const { data, isLoading, isFetched } = useQuery({
		queryKey: ["organization", "active-member-role"],
		queryFn: async () => {
			const result = await authClient.organization.getActiveMemberRole();
			return result.data?.role ?? null;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
		retry: false,
	});

	const role = data ?? null;
	const isOwner = hasRole(role, "owner");
	const isAdmin = hasRole(role, "admin");

	// While still loading and never fetched, assume admin/owner can create
	// This prevents the button from flickering/disappearing during initial load
	const canCreateWebsite = isLoading && !isFetched ? true : isOwner || isAdmin;

	return {
		role,
		isAdmin,
		isOwner,
		canCreateWebsite,
		isLoading,
	};
}
