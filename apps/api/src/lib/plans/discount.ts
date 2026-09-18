import { env } from "@api/env";
import { isPolarEnabled } from "@api/lib/billing-mode";
import polarClient from "@api/lib/polar";
import { TRPCError } from "@trpc/server";

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
	env.NODE_ENV === "production"
		? EARLY_BIRD_DISCOUNT_PRODUCTION
		: EARLY_BIRD_DISCOUNT_SANDBOX;

export type DiscountInfo = {
	id: string;
	name: string;
	code: string | null;
	amount: number; // In cents for fixed discounts, basis points for percentage (100 = 1%)
	type: "fixed" | "percentage";
	currency: string | null;
	duration: "once" | "forever" | "repeating";
	maxRedemptions: number | null;
	redemptionsCount: number;
	redemptionsLeft: number | null;
	startsAt: string | null;
	endsAt: string | null;
};

/**
 * Fetches discount information from Polar API
 * @param discountId - The Polar discount ID
 * @returns Discount information including redemptions left
 */
export async function getDiscountInfo(
	discountId: string
): Promise<DiscountInfo | null> {
	if (!isPolarEnabled()) {
		return null;
	}

	try {
		const discount = await polarClient.discounts.get(discountId);

		if (!discount) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Discount not found",
			});
		}

		const redemptionsLeft =
			discount.max_redemptions !== null
				? discount.max_redemptions - discount.redemptions_count
				: null;

		// Extract amount and currency based on discount type
		let amount = 0;
		let currency: string | null = null;

		if (discount.type === "fixed") {
			// Fixed discounts have amount and currency
			amount = "amount" in discount ? discount.amount : 0;
			currency = "currency" in discount ? discount.currency : null;
		} else {
			// Percentage discounts have basisPoints
			amount = "basis_points" in discount ? discount.basis_points : 0;
		}

		return {
			id: discount.id,
			name: discount.name,
			code: discount.code ?? null,
			amount,
			type: discount.type === "fixed" ? "fixed" : "percentage",
			currency,
			duration: discount.duration,
			maxRedemptions: discount.max_redemptions ?? null,
			redemptionsCount: discount.redemptions_count,
			redemptionsLeft,
			startsAt: discount.starts_at ?? null,
			endsAt: discount.ends_at ?? null,
		};
	} catch (error) {
		console.error("Error fetching discount info:", {
			error,
			discountId,
			message: error instanceof Error ? error.message : "Unknown error",
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to fetch discount information",
		});
	}
}

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
