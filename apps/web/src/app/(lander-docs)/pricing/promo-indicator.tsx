"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function PromoIndicator({
	price,
	promoPrice,
	className,
}: {
	price?: number;
	promoPrice?: number;
	className?: string;
}) {
	if (
		typeof price !== "number" ||
		typeof promoPrice !== "number" ||
		price <= promoPrice
	) {
		return null;
	}

	const discountPercent = Math.max(
		0,
		Math.round(((price - promoPrice) / price) * 100)
	);

	return (
		<span className={cn("relative inline-flex items-center", className)}>
			{/* Label */}
			<span className="relative z-10 inline-flex items-center gap-1 font-medium text-plasma-orange text-xs">
				<span>-{discountPercent}%</span>
			</span>
		</span>
	);
}
