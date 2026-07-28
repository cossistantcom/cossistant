import type { RouteGroup } from "../mount";
import { MESSAGES_ROUTES } from "./messages";
import { ORGANIZATION_ROUTES } from "./organizations";
import { WEBSITE_ROUTES } from "./websites";

export * from "./messages";
export * from "./organizations";
export * from "./websites";

/**
 * Mount table mirroring `apps/api/src/rest/routers/index.ts`.
 *
 * Order is load-bearing: path-key order in the generated document follows
 * registration order.
 */
export const REST_MOUNT_TABLE: readonly RouteGroup[] = [
	{ prefix: "/organizations", routes: ORGANIZATION_ROUTES },
	{ prefix: "/websites", routes: WEBSITE_ROUTES },
	{ prefix: "/messages", routes: MESSAGES_ROUTES },
];
