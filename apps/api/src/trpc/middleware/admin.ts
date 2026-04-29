import { isAdminUser } from "@api/lib/admin";
import { TRPCError } from "@trpc/server";
import type { TRPCContext } from "../init";

export const requireAdmin = (ctx: TRPCContext) => {
	if (!isAdminUser(ctx.user)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Admin access required",
		});
	}
};

export const withAdminPermission = async <TReturn>(options: {
	ctx: TRPCContext;
	next: (opts: { ctx: TRPCContext }) => Promise<TReturn>;
}) => {
	requireAdmin(options.ctx);

	return options.next({
		ctx: options.ctx,
	});
};
