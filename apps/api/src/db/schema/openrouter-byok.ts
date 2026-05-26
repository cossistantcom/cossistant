import {
	type InferInsertModel,
	type InferSelectModel,
	relations,
} from "drizzle-orm";
import {
	boolean,
	index,
	pgTable,
	text,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import {
	ulidNullableReference,
	ulidPrimaryKey,
	ulidReference,
} from "../../utils/db/ids";
import { isoTimestamp as timestamp } from "../../utils/db/timestamp";
import { organization, user } from "./auth";
import { website } from "./website";

export type OpenRouterByokConnectionStatus = "unchecked" | "valid" | "invalid";

export const websiteOpenRouterKey = pgTable(
	"website_openrouter_key",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		websiteId: ulidReference("website_id").references(() => website.id, {
			onDelete: "cascade",
		}),
		enabled: boolean("enabled").default(false).notNull(),
		encryptedApiKey: text("encrypted_api_key").notNull(),
		maskedKey: varchar("masked_key", { length: 80 }).notNull(),
		lastConnectionStatus: varchar("last_connection_status", {
			length: 24,
		})
			.$type<OpenRouterByokConnectionStatus>()
			.default("unchecked")
			.notNull(),
		lastErrorCode: text("last_error_code"),
		lastCheckedAt: timestamp("last_checked_at"),
		fallbackPausedUntil: timestamp("fallback_paused_until"),
		createdBy: ulidReference("created_by").references(() => user.id, {
			onDelete: "cascade",
		}),
		updatedBy: ulidNullableReference("updated_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
	},
	(table) => [
		uniqueIndex("website_openrouter_key_website_unique_idx").on(
			table.websiteId
		),
		index("website_openrouter_key_org_idx").on(table.organizationId),
		index("website_openrouter_key_enabled_idx").on(table.enabled),
	]
);

export const websiteOpenRouterKeyRelations = relations(
	websiteOpenRouterKey,
	({ one }) => ({
		organization: one(organization, {
			fields: [websiteOpenRouterKey.organizationId],
			references: [organization.id],
		}),
		website: one(website, {
			fields: [websiteOpenRouterKey.websiteId],
			references: [website.id],
		}),
		creator: one(user, {
			fields: [websiteOpenRouterKey.createdBy],
			references: [user.id],
		}),
		updater: one(user, {
			fields: [websiteOpenRouterKey.updatedBy],
			references: [user.id],
		}),
	})
);

export type WebsiteOpenRouterKeySelect = InferSelectModel<
	typeof websiteOpenRouterKey
>;
export type WebsiteOpenRouterKeyInsert = InferInsertModel<
	typeof websiteOpenRouterKey
>;
