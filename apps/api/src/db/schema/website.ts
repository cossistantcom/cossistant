import {
	type ContactNotificationSettings,
	type SupportOnboardingState,
	type VisitorAttribution,
	type VisitorCurrentPage,
	WebsiteInstallationTarget,
	WebsiteStatus,
} from "@cossistant/types";
import {
	type InferInsertModel,
	type InferSelectModel,
	relations,
	sql,
} from "drizzle-orm";
import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	real,
	text,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import { enumToPgEnum } from "../../utils/db";
import {
	ulidNullableReference,
	ulidPrimaryKey,
	ulidReference,
} from "../../utils/db/ids";
import { isoTimestamp as timestamp } from "../../utils/db/timestamp";
import { aiAgent } from "./ai-agent";
import { apiKey } from "./api-keys";
import { organization, team, user } from "./auth";
import { conversation } from "./conversation";

export const websiteInstallationTargetEnum = pgEnum(
	"website_installation_target",
	enumToPgEnum(WebsiteInstallationTarget)
);

export const websiteStatusEnum = pgEnum(
	"website_status",
	enumToPgEnum(WebsiteStatus)
);

export const website = pgTable(
	"website",
	{
		id: ulidPrimaryKey("id"),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		domain: text("domain").notNull(),
		defaultLanguage: varchar("default_language", { length: 20 })
			.default("en")
			.notNull(),
		autoTranslateEnabled: boolean("auto_translate_enabled")
			.default(true)
			.notNull(),
		contactEmail: text("contact_email"),
		isDomainOwnershipVerified: boolean("is_domain_ownership_verified")
			.default(false)
			.notNull(),
		description: text("description"),
		logoUrl: text("logo_url"),
		whitelistedDomains: text("whitelisted_domains").array().notNull(),
		defaultParticipantIds: jsonb("default_participant_ids")
			.$type<string[] | null>()
			.default(sql`'[]'::jsonb`),
		installationTarget: websiteInstallationTargetEnum("installation_target")
			.$defaultFn(() => WebsiteInstallationTarget.NEXTJS)
			.notNull(),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		teamId: ulidReference("team_id").references(() => team.id, {
			onDelete: "cascade",
		}),
		status: websiteStatusEnum("status").default(WebsiteStatus.ACTIVE).notNull(),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		// Index for filtering by organization and status
		index("website_org_status_idx").on(table.organizationId, table.status),
		// Index for filtering by team
		index("website_team_idx").on(table.teamId),
		// Index for soft delete queries
		index("website_deleted_at_idx").on(table.deletedAt),
		index("website_slug_idx").on(table.slug),
		index("website_domain_idx").on(table.domain),
		index("website_org_domain_idx").on(
			table.isDomainOwnershipVerified,
			table.domain
		),
	]
);

export const contactOrganization = pgTable(
	"contact_organization",
	{
		id: ulidPrimaryKey("id"),
		name: text("name").notNull(),
		externalId: varchar("external_id", { length: 255 }),
		domain: text("domain"),
		description: text("description"),
		metadata: jsonb("metadata"),
		featureFlags: text("feature_flags"),
		websiteId: ulidReference("website_id")
			.notNull()
			.references(() => website.id, { onDelete: "cascade" }),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		// Index for website lookup
		index("contact_org_site_idx").on(table.websiteId),
		// Index for organization lookup
		index("contact_org_org_idx").on(table.organizationId),
		// Unique index for external ID per website
		uniqueIndex("contact_org_external_id_website_idx").on(
			table.externalId,
			table.websiteId
		),
		// Index for soft delete queries
		index("contact_org_deleted_at_idx").on(table.deletedAt),
	]
);

export const contact = pgTable(
	"contact",
	{
		id: ulidPrimaryKey("id"),
		externalId: varchar("external_id", { length: 255 }),
		name: text("name"),
		email: text("email"),
		image: text("image"),
		metadata: jsonb("metadata"),
		featureFlags: text("feature_flags"),
		onboardingState: jsonb(
			"onboarding_state"
		).$type<SupportOnboardingState | null>(),
		notificationSettings: jsonb(
			"notification_settings"
		).$type<ContactNotificationSettings | null>(),
		// Reference Fields
		websiteId: ulidReference("website_id")
			.notNull()
			.references(() => website.id, { onDelete: "cascade" }),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		contactOrganizationId: ulidNullableReference(
			"contact_organization_id"
		).references(() => contactOrganization.id, { onDelete: "set null" }),
		userId: ulidNullableReference("user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		// Index for website lookup
		index("contact_website_idx").on(table.websiteId),
		// Index for organization lookup
		index("contact_org_idx").on(table.organizationId),
		// Composite index for organization + website queries
		index("contact_org_website_idx").on(table.organizationId, table.websiteId),
		// Index for contact organization lookup
		index("contact_contact_org_idx").on(table.contactOrganizationId),
		// Index for user lookup
		index("contact_user_idx").on(table.userId),
		// Index for email lookup within website
		index("contact_email_website_idx").on(table.email, table.websiteId),
		// Unique index for external ID per website
		uniqueIndex("contact_external_id_website_idx").on(
			table.externalId,
			table.websiteId
		),
		// Index for soft delete queries
		index("contact_deleted_at_idx").on(table.deletedAt),
		// Composite index for counting contacts by website, organization, and deleted status
		index("contact_website_org_deleted_idx").on(
			table.websiteId,
			table.organizationId,
			table.deletedAt
		),
	]
);

export const visitor = pgTable(
	"visitor",
	{
		id: ulidPrimaryKey("id"),
		// Browser and Device Information
		browser: varchar("browser", { length: 100 }),
		browserVersion: varchar("browser_version", { length: 50 }),
		os: varchar("os", { length: 100 }),
		osVersion: varchar("os_version", { length: 50 }),
		device: varchar("device", { length: 100 }),
		deviceType: varchar("device_type", { length: 50 }), // desktop, mobile, tablet
		// Location Information
		ip: varchar("ip", { length: 45 }), // Support both IPv4 and IPv6
		city: varchar("city", { length: 100 }),
		region: varchar("region", { length: 100 }),
		country: varchar("country", { length: 100 }),
		countryCode: varchar("country_code", { length: 2 }),
		latitude: real("latitude"),
		longitude: real("longitude"),
		geoSource: varchar("geo_source", { length: 50 }),
		geoAccuracyRadiusKm: real("geo_accuracy_radius_km"),
		geoResolvedAt: timestamp("geo_resolved_at"),
		// User Preferences
		language: varchar("language", { length: 10 }),
		timezone: varchar("timezone", { length: 100 }),
		// Screen Information
		screenResolution: varchar("screen_resolution", { length: 20 }),
		viewport: varchar("viewport", { length: 20 }),
		// Tracking Information
		attribution: jsonb("attribution").$type<VisitorAttribution | null>(),
		currentPage: jsonb("current_page").$type<VisitorCurrentPage | null>(),
		featureFlags: text("feature_flags"),
		onboardingState: jsonb(
			"onboarding_state"
		).$type<SupportOnboardingState | null>(),
		// Reference Fields
		contactId: ulidNullableReference("contact_id").references(
			() => contact.id,
			{ onDelete: "set null" }
		),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		websiteId: ulidReference("website_id")
			.notNull()
			.references(() => website.id, { onDelete: "cascade" }),
		userId: ulidNullableReference("user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		isTest: boolean("is_test").$defaultFn(() => false),
		blockedAt: timestamp("blocked_at"),
		blockedByUserId: ulidNullableReference("blocked_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		lastSeenAt: timestamp("last_seen_at"),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		// Index for tenant-scoped queries (most important)
		index("visitor_org_idx").on(table.organizationId),
		// Composite index for organization + website queries
		index("visitor_org_website_idx").on(table.organizationId, table.websiteId),
		// Composite index for visitor ID with organization (performance optimization)
		index("visitor_id_org_idx").on(table.id, table.organizationId),
		// Index for looking up visitors by website
		index("visitor_website_idx").on(table.websiteId),
		// Index for looking up visitors by contact (CRITICAL for new contact system)
		index("visitor_contact_idx").on(table.contactId),
		// Composite index for contact + website queries
		index("visitor_contact_website_idx").on(table.contactId, table.websiteId),
		// Index for looking up visitors by user
		index("visitor_user_idx").on(table.userId),
		// Index for active visitors query within organization
		index("visitor_org_last_seen_idx").on(
			table.organizationId,
			table.lastSeenAt
		),
		index("visitor_org_website_last_seen_idx").on(
			table.organizationId,
			table.websiteId,
			table.lastSeenAt,
			table.deletedAt
		),
		// Index for soft delete queries
		index("visitor_deleted_at_idx").on(table.deletedAt),
	]
);

export const view = pgTable(
	"view",
	{
		id: ulidPrimaryKey("id"),
		name: text("name").notNull(),
		description: text("description"),
		prompt: text("prompt"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		websiteId: ulidReference("website_id").references(() => website.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		index("view_org_idx").on(table.organizationId),
		index("view_website_idx").on(table.websiteId),
		uniqueIndex("view_website_name_idx").on(table.websiteId, table.name),
		index("view_deleted_at_idx").on(table.deletedAt),
	]
);

// Relations
export const websiteRelations = relations(website, ({ many, one }) => ({
	organization: one(organization, {
		fields: [website.organizationId],
		references: [organization.id],
	}),
	team: one(team, {
		fields: [website.teamId],
		references: [team.id],
	}),
	visitors: many(visitor),
	contacts: many(contact),
	contactOrganizations: many(contactOrganization),
	aiAgents: many(aiAgent),
	conversations: many(conversation),
	apiKeys: many(apiKey),
	views: many(view),
}));

export const contactOrganizationRelations = relations(
	contactOrganization,
	({ one, many }) => ({
		website: one(website, {
			fields: [contactOrganization.websiteId],
			references: [website.id],
		}),
		organization: one(organization, {
			fields: [contactOrganization.organizationId],
			references: [organization.id],
		}),
		contacts: many(contact),
	})
);

export const contactRelations = relations(contact, ({ one, many }) => ({
	website: one(website, {
		fields: [contact.websiteId],
		references: [website.id],
	}),
	organization: one(organization, {
		fields: [contact.organizationId],
		references: [organization.id],
	}),
	contactOrganization: one(contactOrganization, {
		fields: [contact.contactOrganizationId],
		references: [contactOrganization.id],
	}),
	user: one(user, {
		fields: [contact.userId],
		references: [user.id],
	}),
	visitors: many(visitor),
}));

export const visitorRelations = relations(visitor, ({ one, many }) => ({
	organization: one(organization, {
		fields: [visitor.organizationId],
		references: [organization.id],
	}),
	website: one(website, {
		fields: [visitor.websiteId],
		references: [website.id],
	}),
	contact: one(contact, {
		fields: [visitor.contactId],
		references: [contact.id],
	}),
	user: one(user, {
		fields: [visitor.userId],
		references: [user.id],
	}),
	conversations: many(conversation),
}));

export const viewRelations = relations(view, ({ one }) => ({
	organization: one(organization, {
		fields: [view.organizationId],
		references: [organization.id],
	}),
	website: one(website, {
		fields: [view.websiteId],
		references: [website.id],
	}),
}));

export type WebsiteSelect = InferSelectModel<typeof website>;
export type WebsiteInsert = InferInsertModel<typeof website>;

export type ContactOrganizationSelect = InferSelectModel<
	typeof contactOrganization
>;
export type ContactOrganizationInsert = InferInsertModel<
	typeof contactOrganization
>;

export type ContactSelect = InferSelectModel<typeof contact>;
export type ContactInsert = InferInsertModel<typeof contact>;

export type VisitorSelect = InferSelectModel<typeof visitor>;
export type VisitorInsert = InferInsertModel<typeof visitor>;
export type ViewSelect = InferSelectModel<typeof view>;
export type ViewInsert = InferInsertModel<typeof view>;
