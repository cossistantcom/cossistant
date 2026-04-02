"use client";

import { motion } from "motion/react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function PromoBannerOrnaments({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn("relative w-full", className)}>
			{/* left */}
			<motion.div
				animate={{ scaleY: 1 }}
				className="-top-6 -bottom-6 -left-1 pointer-events-none absolute hidden w-px bg-plasma-orange/10 md:block"
				initial={{ scaleY: 0 }}
				style={{ originY: 0.5 }}
				transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
			/>

			{/* right */}
			<motion.div
				animate={{ scaleY: 1 }}
				className="-top-6 -bottom-6 -right-1 pointer-events-none absolute hidden w-px bg-plasma-orange/10 md:block"
				initial={{ scaleY: 0 }}
				style={{ originY: 0.5 }}
				transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
			/>

			{/* top */}
			<motion.div
				animate={{ scaleX: 1 }}
				className="-left-6 -right-6 pointer-events-none absolute top-2 hidden h-px bg-plasma-orange/10 md:block"
				initial={{ scaleX: 0 }}
				style={{ originX: 0.5 }}
				transition={{ duration: 0.8, delay: 0.45, ease: "easeOut" }}
			/>

			{/* bottom */}
			<motion.div
				animate={{ scaleX: 1 }}
				className="-left-6 -right-6 pointer-events-none absolute bottom-2 hidden h-px bg-plasma-orange/10 md:block"
				initial={{ scaleX: 0 }}
				style={{ originX: 0.5 }}
				transition={{ duration: 0.8, delay: 0.9, ease: "easeOut" }}
			/>

			{/* Content */}
			{children}
		</div>
	);
}
