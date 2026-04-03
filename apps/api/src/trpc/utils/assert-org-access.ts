import { member } from "@api/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

export async function assertOrgAccess(
  db: any,
  userId: string,
  organizationId: string,
) {
  const [membership] = await db
    .select()
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this organization",
    });
  }
}
