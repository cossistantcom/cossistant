import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { ulidPrimaryKey, ulidReference } from "../../utils/db/ids";
import { isoTimestamp as timestamp } from "../../utils/db/timestamp";
import { organization } from "./auth";

export const waitlistEntry = pgTable(
  "waitlist_entry",
  {
    id: ulidPrimaryKey("id"),
    organizationId: ulidReference("organization_id").references(
      () => organization.id,
      { onDelete: "cascade" },
    ),
    email: text("email").notNull(),
    name: text("name"),
    company: text("company"),
    useCase: text("use_case"),
    source: text("source"),
    score: integer("score").default(0),
    status: text("status").default("pending").notNull(), // pending | contacted | converted | rejected
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date().toISOString())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date().toISOString())
      .notNull(),
  },
  (table) => [
    index("waitlist_org_idx").on(table.organizationId),
    index("waitlist_email_idx").on(table.email),
    index("waitlist_status_idx").on(table.status),
    index("waitlist_score_idx").on(table.score),
  ],
);

export type WaitlistEntrySelect = InferSelectModel<typeof waitlistEntry>;
export type WaitlistEntryInsert = InferInsertModel<typeof waitlistEntry>;
