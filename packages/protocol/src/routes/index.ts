import type { RouteGroup } from "../mount";
import { AI_AGENT_ROUTES } from "./ai-agents";
import { CONTACT_CONTROL_ROUTES, CONTACT_RUNTIME_ROUTES } from "./contacts";
import { CONVERSATION_ROUTES } from "./conversations";
import { FEEDBACK_CREATE_ROUTES, FEEDBACK_READ_ROUTES } from "./feedback";
import { KNOWLEDGE_ROUTES } from "./knowledge";
import { MESSAGES_ROUTES } from "./messages";
import { ORGANIZATION_ROUTES } from "./organizations";
import { SUPPORT_CONTROL_ROUTES, SUPPORT_RUNTIME_ROUTES } from "./support";
import { UPLOAD_ROUTES } from "./uploads";
import { VISITOR_ROUTES } from "./visitors";
import { WEBSITE_ROUTES } from "./websites";

export * from "./ai-agents";
export * from "./contacts";
export * from "./conversations";
export * from "./feedback";
export * from "./knowledge";
export * from "./messages";
export * from "./organizations";
export * from "./support";
export * from "./uploads";
export * from "./visitors";
export * from "./websites";

/**
 * Mount table mirroring `apps/api/src/rest/routers/index.ts`.
 *
 * Order is load-bearing: path-key order in the generated document follows
 * registration order.
 */
export const REST_MOUNT_TABLE: readonly RouteGroup[] = [
	{ prefix: "/ai-agents", routes: AI_AGENT_ROUTES },
	{ prefix: "/organizations", routes: ORGANIZATION_ROUTES },
	{ prefix: "/websites", routes: WEBSITE_ROUTES },
	{ prefix: "/messages", routes: MESSAGES_ROUTES },
	{ prefix: "/conversations", routes: CONVERSATION_ROUTES },
	{ prefix: "/visitors", routes: VISITOR_ROUTES },
	{
		prefix: "/contacts",
		groups: [
			{ prefix: "/", routes: CONTACT_RUNTIME_ROUTES },
			{ prefix: "/", routes: CONTACT_CONTROL_ROUTES },
		],
	},
	{
		prefix: "/support",
		groups: [
			{ prefix: "/", routes: SUPPORT_RUNTIME_ROUTES },
			{ prefix: "/", routes: SUPPORT_CONTROL_ROUTES },
		],
	},
	{ prefix: "/uploads", routes: UPLOAD_ROUTES },
	{ prefix: "/knowledge", routes: KNOWLEDGE_ROUTES },
	{
		prefix: "/feedback",
		groups: [
			{ prefix: "/", routes: FEEDBACK_CREATE_ROUTES },
			{ prefix: "/", routes: FEEDBACK_READ_ROUTES },
		],
	},
];
