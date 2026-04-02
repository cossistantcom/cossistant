import { addUserToDefaultAudience } from "@plasma/transactional";

type AuthUserLike = {
	id?: unknown;
	email?: unknown;
	name?: unknown;
};

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export async function syncUserToDefaultResendAudience(
	user: AuthUserLike
): Promise<void> {
	const userId = toNonEmptyString(user.id);
	const email = toNonEmptyString(user.email);
	const name = toNonEmptyString(user.name);

	if (!email) {
		console.warn(
			`[auth] Skipping Resend audience sync: missing email${userId ? ` (userId: ${userId})` : ""}`
		);
		return;
	}

	try {
		const didAddUser = await addUserToDefaultAudience(email, name);
		if (!didAddUser) {
			console.error(
				`[auth] Failed to add user to default Resend audience: ${email}${userId ? ` (userId: ${userId})` : ""}`
			);
		}
	} catch (error) {
		console.error(
			`[auth] Error adding user to default Resend audience: ${email}${userId ? ` (userId: ${userId})` : ""}`,
			error
		);
	}
}
