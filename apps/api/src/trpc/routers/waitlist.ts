import { member } from "@api/db/schema/auth";
import { waitlistEntry } from "@api/db/schema/waitlist";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

const waitlistStatusSchema = z.enum([
  "pending",
  "contacted",
  "converted",
  "rejected",
]);

async function assertOrgAccess(
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

export const waitlistRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        status: waitlistStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx: { db, user }, input }) => {
      await assertOrgAccess(db, user.id, input.organizationId);

      const conditions = [
        eq(waitlistEntry.organizationId, input.organizationId),
      ];
      if (input.status) {
        conditions.push(eq(waitlistEntry.status, input.status));
      }

      const [rows, [totalRow]] = await Promise.all([
        db
          .select()
          .from(waitlistEntry)
          .where(and(...conditions))
          .orderBy(asc(waitlistEntry.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ total: count(waitlistEntry.id) })
          .from(waitlistEntry)
          .where(and(...conditions)),
      ]);

      return {
        items: rows,
        total: totalRow?.total ?? 0,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        email: z.string().email(),
        name: z.string().optional(),
        company: z.string().optional(),
        useCase: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx: { db, user }, input }) => {
      await assertOrgAccess(db, user.id, input.organizationId);

      const [entry] = await db
        .insert(waitlistEntry)
        .values({
          organizationId: input.organizationId,
          email: input.email,
          name: input.name ?? null,
          company: input.company ?? null,
          useCase: input.useCase ?? null,
          source: input.source ?? null,
          status: "pending",
        })
        .returning();

      if (!entry) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create waitlist entry",
        });
      }

      return entry;
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        organizationId: z.string(),
        status: waitlistStatusSchema,
      }),
    )
    .mutation(async ({ ctx: { db, user }, input }) => {
      await assertOrgAccess(db, user.id, input.organizationId);

      const [updated] = await db
        .update(waitlistEntry)
        .set({ status: input.status, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(waitlistEntry.id, input.id),
            eq(waitlistEntry.organizationId, input.organizationId),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Waitlist entry not found",
        });
      }

      return updated;
    }),
});
