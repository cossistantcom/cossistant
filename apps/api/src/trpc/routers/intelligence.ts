import { member } from "@api/db/schema/auth";
import { conversation } from "@api/db/schema/conversation";
import { dossier } from "@api/db/schema/dossier";
import { contact, visitor } from "@api/db/schema/website";
import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { assertOrgAccess } from "../utils/assert-org-access";

const periodSchema = z.enum(["day", "week", "month"]);

function periodToWindowStart(period: z.infer<typeof periodSchema>): Date {
  const now = new Date();
  if (period === "day") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  if (period === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

export const intelligenceRouter = createTRPCRouter({
  vipList: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        websiteId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx: { db, user }, input }) => {
      await assertOrgAccess(db, user.id, input.organizationId);

      const rows = await db
        .select({
          visitorId: visitor.id,
          contactId: visitor.contactId,
          contactName: contact.name,
          contactEmail: contact.email,
          contactImage: contact.image,
          city: visitor.city,
          country: visitor.country,
          conversationCount: count(conversation.id),
        })
        .from(visitor)
        .leftJoin(contact, eq(visitor.contactId, contact.id))
        .leftJoin(
          conversation,
          and(
            eq(conversation.visitorId, visitor.id),
            eq(conversation.websiteId, input.websiteId),
          ),
        )
        .where(
          and(
            eq(visitor.organizationId, input.organizationId),
            eq(visitor.websiteId, input.websiteId),
          ),
        )
        .groupBy(
          visitor.id,
          contact.id,
          contact.name,
          contact.email,
          contact.image,
        )
        .orderBy(desc(count(conversation.id)))
        .limit(input.limit)
        .offset(input.offset);

      return { items: rows, limit: input.limit, offset: input.offset };
    }),

  digest: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        websiteId: z.string(),
        period: periodSchema.default("week"),
      }),
    )
    .query(async ({ ctx: { db, user }, input }) => {
      await assertOrgAccess(db, user.id, input.organizationId);

      const windowStart = periodToWindowStart(input.period);
      const windowStartIso = windowStart.toISOString();

      const [conversationRow] = await db
        .select({ total: count(conversation.id) })
        .from(conversation)
        .where(
          and(
            eq(conversation.organizationId, input.organizationId),
            eq(conversation.websiteId, input.websiteId),
            gte(conversation.createdAt, windowStartIso),
          ),
        );

      const [visitorRow] = await db
        .select({ total: count(visitor.id) })
        .from(visitor)
        .where(
          and(
            eq(visitor.organizationId, input.organizationId),
            eq(visitor.websiteId, input.websiteId),
            gte(visitor.createdAt, windowStartIso),
          ),
        );

      return {
        period: input.period,
        windowStart: windowStartIso,
        totalConversations: conversationRow?.total ?? 0,
        newVisitors: visitorRow?.total ?? 0,
      };
    }),

  triageQueue: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        websiteId: z.string(),
      }),
    )
    .query(async ({ ctx: { db, user }, input }) => {
      await assertOrgAccess(db, user.id, input.organizationId);

      const rows = await db
        .select({
          conversationId: conversation.id,
          visitorId: conversation.visitorId,
          title: conversation.title,
          status: conversation.status,
          escalatedAt: conversation.escalatedAt,
          createdAt: conversation.createdAt,
          contactName: contact.name,
          contactEmail: contact.email,
        })
        .from(conversation)
        .leftJoin(visitor, eq(conversation.visitorId, visitor.id))
        .leftJoin(contact, eq(visitor.contactId, contact.id))
        .where(
          and(
            eq(conversation.organizationId, input.organizationId),
            eq(conversation.websiteId, input.websiteId),
            sql`${conversation.escalatedAt} is not null`,
          ),
        )
        .orderBy(asc(conversation.escalatedAt))
        .limit(50);

      return { items: rows };
    }),

  userProfile: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        visitorId: z.string(),
      }),
    )
    .query(async ({ ctx: { db, user }, input }) => {
      await assertOrgAccess(db, user.id, input.organizationId);

      const [visitorRow] = await db
        .select()
        .from(visitor)
        .where(
          and(
            eq(visitor.id, input.visitorId),
            eq(visitor.organizationId, input.organizationId),
          ),
        )
        .limit(1);

      if (!visitorRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Visitor not found",
        });
      }

      const [dossierRow] = await db
        .select()
        .from(dossier)
        .where(
          and(
            eq(dossier.visitorId, input.visitorId),
            eq(dossier.organizationId, input.organizationId),
          ),
        )
        .limit(1);

      const contactRow = visitorRow.contactId
        ? await db
            .select()
            .from(contact)
            .where(eq(contact.id, visitorRow.contactId))
            .limit(1)
            .then((r) => r[0] ?? null)
        : null;

      const [conversationRow] = await db
        .select({ total: count(conversation.id) })
        .from(conversation)
        .where(eq(conversation.visitorId, input.visitorId));

      return {
        visitor: visitorRow,
        contact: contactRow,
        dossier: dossierRow ?? null,
        conversationCount: conversationRow?.total ?? 0,
      };
    }),
});
