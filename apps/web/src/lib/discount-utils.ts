import type { RouterOutputs } from "@plasma/api/types";

/**
 * Early bird discount IDs from Polar
 * - Offer: $9 off per month for life
 * - Max redemptions: 150
 */
const EARLY_BIRD_DISCOUNT_PRODUCTION = "0bc0399c-ee9b-436f-be70-cd02af419cd4";
const EARLY_BIRD_DISCOUNT_SANDBOX = "5f9eb3b0-75d6-4291-851d-d40b0c7965eb";

/**
 * Get the appropriate Early Bird discount ID based on environment
 */
export const EARLY_BIRD_DISCOUNT_ID =
	process.env.NODE_ENV === "production"
		? EARLY_BIRD_DISCOUNT_PRODUCTION
		: EARLY_BIRD_DISCOUNT_SANDBOX;

export type DiscountInfo = NonNullable<
	RouterOutputs["plan"]["getDiscountInfo"]
>;

/**
 * Calculates the discounted price
 * @param originalPrice - Original price in dollars
 * @param discount - Discount information
 * @returns Discounted price in dollars
 */
export function calculateDiscountedPrice(
	originalPrice: number,
	discount: DiscountInfo
): number {
	if (discount.type === "fixed") {
		// Discount amount is in cents, convert to dollars
		const discountInDollars = discount.amount / 100;
		return Math.max(0, originalPrice - discountInDollars);
	}
	// Percentage discount
	const discountAmount = (originalPrice * discount.amount) / 100;
	return Math.max(0, originalPrice - discountAmount);
}

/**
 * Formats the discount offer text
 * @param discount - Discount information
 * @returns Formatted discount description
 */
export function formatDiscountOffer(discount: DiscountInfo): string {
	if (discount.type === "fixed") {
		const discountInDollars = discount.amount / 100;
		const durationText =
			discount.duration === "forever"
				? "per month for life"
				: discount.duration === "once"
					? "on first month"
					: "per month";
		return `$${discountInDollars} off ${durationText}`;
	}
	// Percentage discount
	const durationText =
		discount.duration === "forever"
			? "for life"
			: discount.duration === "once"
				? "on first month"
				: "";
	return `${discount.amount}% off ${durationText}`;
}

/**
 * Checks if a discount is still available
 * @param discount - Discount information
 * @returns True if the discount is available, false otherwise
 */
export function isDiscountAvailable(discount: DiscountInfo): boolean {
	// Check if redemptions left
	if (discount.redemptionsLeft !== null && discount.redemptionsLeft <= 0) {
		return false;
	}

	// Check if expired
	if (discount.endsAt) {
		const endDate = new Date(discount.endsAt);
		if (endDate < new Date()) {
			return false;
		}
	}

	// Check if not yet started
	if (discount.startsAt) {
		const startDate = new Date(discount.startsAt);
		if (startDate > new Date()) {
			return false;
		}
	}

	return true;
}
