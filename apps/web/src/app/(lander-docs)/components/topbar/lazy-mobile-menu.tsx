"use client";

import dynamic from "next/dynamic";

export const LazyTopbarMobileMenu = dynamic(
	() =>
		import("./mobile-menu").then(({ TopbarMobileMenu }) => TopbarMobileMenu),
	{ ssr: false }
);
