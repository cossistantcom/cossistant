import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import {
	ulidNullableReference,
	ulidPrimaryKey,
	ulidReference,
} from "../../utils/db/ids";
import { member, organization, user } from "./auth";
import { website } from "./website";

export type LifecycleEmailEventMetadata = Record<string, unknown> | null;

export const lifecycleEmailEvent = pgTable(
	"lifecycle_email_event",
	{
		id: ulidPrimaryKey("id"),
		dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
		emailKey: varchar("email_key", { length: 100 }).notNull(),
		status: varchar("status", { length: 30 }).default("scheduled").notNull(),
		recipientUserId: ulidNullableReference("recipient_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		recipientMemberId: ulidNullableReference("recipient_member_id").references(
			() => member.id,
			{ onDelete: "set null" }
		),
		recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
		organizationId: ulidReference("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		websiteId: ulidNullableReference("website_id").references(
			() => website.id,
			{
				onDelete: "set null",
			}
		),
		scheduledAt: timestamp("scheduled_at").notNull(),
		claimedAt: timestamp("claimed_at"),
		sentAt: timestamp("sent_at"),
		failedAt: timestamp("failed_at"),
		attemptCount: integer("attempt_count").default(0).notNull(),
		lastError: text("last_error"),
		metadata: jsonb("metadata").$type<LifecycleEmailEventMetadata>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("lifecycle_email_event_dedupe_key_idx").on(table.dedupeKey),
		index("lifecycle_email_event_status_scheduled_idx").on(
			table.status,
			table.scheduledAt
		),
		index("lifecycle_email_event_org_idx").on(table.organizationId),
		index("lifecycle_email_event_website_idx").on(table.websiteId),
		index("lifecycle_email_event_recipient_user_idx").on(table.recipientUserId),
		index("lifecycle_email_event_email_key_idx").on(table.emailKey),
	]
);

export type LifecycleEmailEventSelect = InferSelectModel<
	typeof lifecycleEmailEvent
>;
export type LifecycleEmailEventInsert = InferInsertModel<
	typeof lifecycleEmailEvent
>;
