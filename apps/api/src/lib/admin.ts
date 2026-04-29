type RoleValue = string | string[] | null | undefined;

export function hasAdminRole(role: RoleValue): boolean {
	if (Array.isArray(role)) {
		return role.some((item) => item.trim().toLowerCase() === "admin");
	}

	if (!role) {
		return false;
	}

	return role
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.includes("admin");
}

export function isAdminUser(
	user: { role?: RoleValue } | null | undefined
): boolean {
	return hasAdminRole(user?.role);
}
