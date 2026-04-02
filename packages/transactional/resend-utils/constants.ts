// Email system constants
export const ANTHONY_EMAIL = "anthony@plasma-pandora.com";
export const TRANSACTIONAL_EMAIL_DOMAIN = "updates.plasma-pandora.com";
export const DEFAULT_RESEND_AUDIENCE_ID =
	"668cc440-8027-4a31-9f8f-2633efbf12a4";
export const RESEND_AUDIENCE_ID =
	process.env.RESEND_AUDIENCE_ID?.trim() || DEFAULT_RESEND_AUDIENCE_ID;

// Email variant to sender mapping (only notifications and marketing)
export const VARIANT_TO_FROM_MAP = {
	notifications: "Cossistant <notifications@mail.plasma-pandora.com>",
	marketing: "Anthony from Cossistant <anthony@updates.plasma-pandora.com>",
} as const;
