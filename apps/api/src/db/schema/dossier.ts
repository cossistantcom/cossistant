import {
  type InferInsertModel,
  type InferSelectModel,
  relations,
} from "drizzle-orm";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  ulidNullableReference,
  ulidPrimaryKey,
  ulidReference,
} from "../../utils/db/ids";
import { isoTimestamp as timestamp } from "../../utils/db/timestamp";
import { organization } from "./auth";

export const dossier = pgTable(
  "dossier",
  {
    id: ulidPrimaryKey("id"),
    organizationId: ulidReference("organization_id").references(
      () => organization.id,
      { onDelete: "cascade" },
    ),
    visitorId: ulidReference("visitor_id").notNull(),
    contactId: ulidNullableReference("contact_id"),
    content: text("content").notNull().default(""),
    tokenCount: integer("token_count").default(0).notNull(),
    lastInteractionAt: timestamp("last_interaction_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date().toISOString())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date().toISOString())
      .notNull(),
  },
  (table) => [
    index("dossier_org_visitor_idx").on(table.organizationId, table.visitorId),
    index("dossier_contact_idx").on(table.contactId),
  ],
);

export const dossierRelations = relations(dossier, ({ one }) => ({
  organization: one(organization, {
    fields: [dossier.organizationId],
    references: [organization.id],
  }),
}));

export type DossierSelect = InferSelectModel<typeof dossier>;
export type DossierInsert = InferInsertModel<typeof dossier>;
