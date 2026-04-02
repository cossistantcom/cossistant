import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { ulidPrimaryKey, ulidReference } from "../../utils/db/ids";
import { isoTimestamp as timestamp } from "../../utils/db/timestamp";
import { organization } from "./auth";

export const auditLog = pgTable(
  "audit_log",
  {
    id: ulidPrimaryKey("id"),
    organizationId: ulidReference("organization_id").references(
      () => organization.id,
      { onDelete: "cascade" },
    ),
    actorType: text("actor_type").notNull(), // "user" | "ai_agent" | "visitor" | "system"
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date().toISOString())
      .notNull(),
  },
  (table) => [
    index("audit_log_org_idx").on(table.organizationId),
    index("audit_log_actor_idx").on(table.actorType, table.actorId),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_created_idx").on(table.createdAt),
  ],
);

export type AuditLogSelect = InferSelectModel<typeof auditLog>;
export type AuditLogInsert = InferInsertModel<typeof auditLog>;
