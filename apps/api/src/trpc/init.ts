import type { Database } from "@api/db";
import { db } from "@api/db";
import type { AuthType, auth } from "@api/lib/auth";
import type { realtime } from "@api/realtime/emitter";
import { getGeoContext } from "@api/utils/geo";
import { initTRPC } from "@trpc/server";
import type { Context } from "hono";
import superjson from "superjson";
import { withAdminPermission } from "./middleware/admin";
import { withPermission } from "./middleware/auth";
import { withPrimaryDbMiddleware } from "./middleware/db";
import { withRateLimitMiddleware } from "./middleware/rate-limit";

// Extended session type that includes custom fields from the database schema
export type ExtendedSession = typeof auth.$Infer.Session.session & {
	activeOrganizationId?: string | null;
	activeTeamId?: string | null;
};

export type TRPCContext = {
	user: typeof auth.$Infer.Session.user;
	session: ExtendedSession;
	db: Database;
	geo: ReturnType<typeof getGeoContext>;
	headers: Headers;
	appendResponseHeader?: (name: string, value: string) => void;
};

export const createTRPCContext = async (
	_: unknown,
	c: Context<AuthType>
): Promise<TRPCContext> => {
	const user = c.get("user") as typeof auth.$Infer.Session.user;
	const session = c.get("session") as ExtendedSession;

	const geo = getGeoContext(c.req);

	return {
		user,
		session,
		geo,
		db,
		headers: c.req.raw.headers,
		appendResponseHeader: (name, value) => {
			c.header(name, value, { append: true });
		},
	};
};

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure.use(withPrimaryDbMiddleware);

const withPermissionMiddleware = t.middleware(async (opts) =>
	withPermission({
		ctx: opts.ctx,
		next: opts.next,
	})
);

const withAdminPermissionMiddleware = t.middleware(async (opts) =>
	withAdminPermission({
		ctx: opts.ctx,
		next: opts.next,
	})
);

export const protectedProcedure = t.procedure
	.use(withPermissionMiddleware)
	.use(withPrimaryDbMiddleware);

export const adminProcedure = t.procedure
	.use(withPermissionMiddleware)
	.use(withAdminPermissionMiddleware)
	.use(withPrimaryDbMiddleware);

export const rateLimitedPublicProcedure = t.procedure
	.use(withRateLimitMiddleware)
	.use(withPrimaryDbMiddleware);
