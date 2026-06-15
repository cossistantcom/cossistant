import { resend } from "./client";
import { RESEND_AUDIENCE_ID } from "./constants";

export type ContactData = {
	email: string;
	firstName?: string;
	lastName?: string;
	unsubscribed?: boolean;
};

function isNotFoundError(error: unknown): boolean {
	if (!(error && typeof error === "object")) {
		return false;
	}

	const maybeStatus = "statusCode" in error ? error.statusCode : undefined;
	const maybeStatusNumber =
		typeof maybeStatus === "number"
			? maybeStatus
			: typeof maybeStatus === "string"
				? Number.parseInt(maybeStatus, 10)
				: null;

	if (maybeStatusNumber === 404) {
		return true;
	}

	const message =
		"message" in error && typeof error.message === "string"
			? error.message.toLowerCase()
			: "";

	return message.includes("not found");
}

/**
 * Add a contact to a Resend audience
 */
export async function addContactToAudience(
	audienceId: string,
	contactData: ContactData
): Promise<boolean> {
	if (!resend) {
		console.error(
			"RESEND_API_KEY is not set in environment variables. Skipping."
		);
		return false;
	}

	try {
		await resend.contacts.create({
			email: contactData.email,
			firstName: contactData.firstName,
			lastName: contactData.lastName,
			unsubscribed: contactData.unsubscribed ?? false,
			audienceId,
		});

		console.log(
			`Successfully added contact ${contactData.email} to Resend audience ${audienceId}`
		);
		return true;
	} catch (error) {
		console.error("Failed to add contact to Resend audience:", error);
		return false;
	}
}

/**
 * Remove a contact from a Resend audience by email
 */
export async function removeContactFromAudience(
	audienceId: string,
	email: string
): Promise<boolean> {
	if (!resend) {
		console.error(
			"RESEND_API_KEY is not set in environment variables. Skipping."
		);
		return false;
	}

	try {
		await resend.contacts.remove({
			email,
			audienceId,
		});

		console.log(
			`Successfully removed contact ${email} from Resend audience ${audienceId}`
		);
		return true;
	} catch (error) {
		if (isNotFoundError(error)) {
			console.log(
				`Contact ${email} was already absent from Resend audience ${audienceId}`
			);
			return true;
		}

		console.error("Failed to remove contact from Resend audience:", error);
		return false;
	}
}

/**
 * Remove a contact from a Resend audience by contact ID
 */
export async function removeContactFromAudienceById(
	audienceId: string,
	contactId: string
): Promise<boolean> {
	if (!resend) {
		console.error(
			"RESEND_API_KEY is not set in environment variables. Skipping."
		);
		return false;
	}

	try {
		await resend.contacts.remove({
			id: contactId,
			audienceId,
		});

		console.log(
			`Successfully removed contact ${contactId} from Resend audience ${audienceId}`
		);
		return true;
	} catch (error) {
		if (isNotFoundError(error)) {
			console.log(
				`Contact ${contactId} was already absent from Resend audience ${audienceId}`
			);
			return true;
		}

		console.error("Failed to remove contact from Resend audience:", error);
		return false;
	}
}

/**
 * Update a contact's subscription status in a Resend audience
 */
export async function updateContactSubscriptionStatus(
	audienceId: string,
	email: string,
	unsubscribed: boolean
): Promise<boolean> {
	if (!resend) {
		console.error(
			"RESEND_API_KEY is not set in environment variables. Skipping."
		);
		return false;
	}

	try {
		await resend.contacts.update({
			email,
			audienceId,
			unsubscribed,
		});

		console.log(
			`Successfully updated contact ${email} subscription status to ${unsubscribed ? "unsubscribed" : "subscribed"}`
		);
		return true;
	} catch (error) {
		console.error("Failed to update contact subscription status:", error);
		return false;
	}
}

/**
 * Add a user to the default Cossistant audience
 */
export async function addUserToDefaultAudience(
	email: string,
	name?: string
): Promise<boolean> {
	const firstName = name?.split(" ")[0] || "";
	const lastName = name?.split(" ").slice(1).join(" ") || "";

	return addContactToAudience(RESEND_AUDIENCE_ID, {
		email,
		firstName,
		lastName,
		unsubscribed: false,
	});
}

/**
 * Remove a user from the default Cossistant audience
 */
export async function removeUserFromDefaultAudience(
	email: string
): Promise<boolean> {
	return removeContactFromAudience(RESEND_AUDIENCE_ID, email);
}
