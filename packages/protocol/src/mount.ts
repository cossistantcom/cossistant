import type { createRoute } from "@hono/zod-openapi";

export type RouteDescriptor = ReturnType<typeof createRoute>;

/**
 * A mounted group of route descriptors.
 *
 * The table is recursive because several Cossistant routers register two
 * sub-routers at the same prefix with different auth middleware (public-key
 * runtime routes vs private-key control routes). Flattening those into one
 * array would emit identical paths, but it would erase the record of which
 * middleware each route belongs to — and a control route accidentally
 * registered on a runtime sub-router is reachable with a public key without
 * changing the OpenAPI document at all.
 *
 * Order matters: `.route()` copies definitions in array order, and path-key
 * order in the generated document follows registration order.
 */
export type RouteGroup = {
	/** Mount prefix, e.g. `/contacts`. `/` for a nested auth split. */
	prefix: string;
	/** Descriptors registered directly on this group, in registration order. */
	routes?: readonly RouteDescriptor[];
	/** Nested sub-routers, in mount order. */
	groups?: readonly RouteGroup[];
};

/** Every descriptor in a group tree, depth-first in registration order. */
export function flattenRouteGroup(
	group: RouteGroup
): readonly RouteDescriptor[] {
	return [
		...(group.routes ?? []),
		...(group.groups ?? []).flatMap((child) => flattenRouteGroup(child)),
	];
}
