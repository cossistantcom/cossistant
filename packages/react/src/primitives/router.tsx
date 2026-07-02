"use client";

import type { RouteRegistry } from "@cossistant/core";
import type React from "react";

// Type-safe page definition that extracts params from RouteRegistry
export type PageDefinition<
	K extends keyof RouteRegistry = keyof RouteRegistry,
> = {
	name: K;
	component: React.ComponentType<{ params?: RouteRegistry[K] }>;
};

// Router props that maintain type safety
export type RouterProps = {
	page: keyof RouteRegistry;
	params?: RouteRegistry[keyof RouteRegistry];
	pages: PageDefinition[];
	fallback?: React.ComponentType<{ params?: unknown }>;
};

/**
 * Type-safe router that renders pages based on current page name.
 * Pages are matched synchronously without effects or registries.
 *
 * @example
 * const pages = [
 *   { name: "HOME", component: HomePage },
 *   { name: "SETTINGS", component: SettingsPage }
 * ];
 *
 * <Router page={currentPage} params={params} pages={pages} fallback={NotFoundPage} />
 */
export const Router: React.FC<RouterProps> = ({
	page,
	params,
	pages,
	fallback: Fallback,
}) => {
	// Find matching page (synchronous, no effects!)
	const matchedPage = pages.find((p) => p.name === page);

	if (matchedPage) {
		const Component = matchedPage.component;
		return <Component params={params} />;
	}

	// Fall back if provided
	if (Fallback) {
		return <Fallback params={params} />;
	}

	return null;
};
