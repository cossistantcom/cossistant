import {
	type InferInsertModel,
	type InferSelectModel,
	relations,
} from "drizzle-orm";
import {
	boolean,
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

import { website } from "./website";

export const user = pgTable(
	"user",
	{
		id: ulidPrimaryKey("id"),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified")
			.$defaultFn(() => false)
			.notNull(),
		image: text("image"),
		isAnonymous: boolean("is_anonymous")
			.$defaultFn(() => false)
			.notNull(),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date())
			.notNull(),
		lastSeenAt: timestamp("last_seen_at"),
		role: text("role"),
		banned: boolean("banned"),
		banReason: text("ban_reason"),
		banExpires: timestamp("ban_expires"),
	},
	(table) => [
		// Index for email lookups
		index("user_email_idx").on(table.email),
		// Index for role-based queries
		index("user_role_idx").on(table.role),
		// Index for banned users
		index("user_banned_idx").on(table.banned),
		// Index for presence queries (last_seen_at)
		index("user_last_seen_at_idx").on(table.lastSeenAt),
	]
);

export const session = pgTable(
	"session",
	{
		id: ulidPrimaryKey("id"),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: ulidReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		activeOrganizationId: ulidNullableReference("active_organization_id"),
		activeTeamId: ulidNullableReference("active_team_id"),
		impersonatedBy: ulidNullableReference("impersonated_by"),
	},
	(table) => [
		// Index for token lookups
		index("session_token_idx").on(table.token),
		// Index for user sessions
		index("session_user_idx").on(table.userId),
		// Index for active organization
		index("session_active_org_idx").on(table.activeOrganizationId),
		// Index for active team
		index("session_active_team_idx").on(table.activeTeamId),
		// Index for expired sessions cleanup
		index("session_expires_at_idx").on(table.expiresAt),
	]
);

export const account = pgTable(
	"account",
	{
		id: ulidPrimaryKey("id"),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: ulidReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		// Index for provider lookups
		index("account_provider_idx").on(table.providerId),
		// Index for user accounts
		index("account_user_idx").on(table.userId),
		// Index for token expiration
		index("account_token_expires_idx").on(table.accessTokenExpiresAt),
	]
);

export const verification = pgTable(
	"verification",
	{
		id: ulidPrimaryKey("id"),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").$defaultFn(
			() => /* @__PURE__ */ new Date()
		),
		updatedAt: timestamp("updated_at").$defaultFn(
			() => /* @__PURE__ */ new Date()
		),
	},
	(table) => [
		// Index for identifier lookups
		index("verification_identifier_idx").on(table.identifier),
		// Index for expired verifications cleanup
		index("verification_expires_at_idx").on(table.expiresAt),
	]
);

export const organization = pgTable(
	"organization",
	{
		id: ulidPrimaryKey("id"),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		timezone: varchar("timezone", { length: 100 }).default("UTC").notNull(),
		weeklyDigestEnabled: boolean("weekly_digest_enabled")
			.default(true)
			.notNull(),
		createdAt: timestamp("created_at").notNull(),
		metadata: text("metadata"),
	},
	(table) => [
		// Index for slug lookups
		index("organization_slug_idx").on(table.slug),
	]
);

export const member = pgTable(
	"member",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		userId: ulidReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		role: text("role").default("member").notNull(),
		createdAt: timestamp("created_at").notNull(),
	},
	(table) => [
		// Index for organization members
		index("member_org_idx").on(table.organizationId),
		// Composite index for organization members by role (performance optimization)
		index("member_org_role_idx").on(table.organizationId, table.role),
		// Index for user memberships
		index("member_user_idx").on(table.userId),
		// Index for role-based queries
		index("member_role_idx").on(table.role),
	]
);

export const memberNotificationSetting = pgTable(
	"member_notification_setting",
	{
		id: ulidPrimaryKey("id"),
		memberId: ulidReference("member_id")
			.notNull()
			.references(() => member.id, {
				onDelete: "cascade",
			}),
		organizationId: ulidReference("organization_id")
			.notNull()
			.references(() => organization.id, {
				onDelete: "cascade",
			}),
		channel: text("channel").notNull(),
		enabled: boolean("enabled")
			.$defaultFn(() => true)
			.notNull(),
		config: jsonb("config"),
		priority: integer("priority")
			.$defaultFn(() => 0)
			.notNull(),
		delaySeconds: integer("delay_seconds")
			.$defaultFn(() => 0)
			.notNull(),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		index("member_notification_setting_member_idx").on(table.memberId),
		index("member_notification_setting_org_idx").on(table.organizationId),
		index("member_notification_setting_channel_idx").on(table.channel),
		index("member_notification_setting_priority_idx").on(table.priority),
		uniqueIndex("member_notification_setting_member_channel_idx").on(
			table.memberId,
			table.channel
		),
	]
);

export const team = pgTable(
	"team",
	{
		id: ulidPrimaryKey("id"),
		name: text("name").notNull(),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		// Index for organization teams
		index("team_org_idx").on(table.organizationId),
		// Index for team name lookup within org
		index("team_org_name_idx").on(table.organizationId, table.name),
	]
);

export const teamMember = pgTable(
	"teamMember",
	{
		id: ulidPrimaryKey("id"),
		teamId: ulidReference("team_id").references(() => team.id, {
			onDelete: "cascade",
		}),
		userId: ulidReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		// Index for team members lookup
		index("team_member_team_idx").on(table.teamId),
		// Index for user's teams lookup
		index("team_member_user_idx").on(table.userId),
	]
);

export const invitation = pgTable(
	"invitation",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date())
			.notNull(),
		inviterId: ulidReference("inviter_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		teamId: ulidNullableReference("team_id").references(() => team.id, {
			onDelete: "cascade",
		}),
	},
	(table) => [
		// Index for organization invitations
		index("invitation_org_idx").on(table.organizationId),
		// Index for email lookups
		index("invitation_email_idx").on(table.email),
		// Index for status-based queries
		index("invitation_status_idx").on(table.status),
		// Index for expired invitations cleanup
		index("invitation_expires_at_idx").on(table.expiresAt),
		// Index for team invitations
		index("invitation_team_idx").on(table.teamId),
	]
);

// Relations
export const userRelations = relations(user, ({ many, one }) => ({
	sessions: many(session),
	accounts: many(account),
	memberships: many(member),
	invitations: many(invitation),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
	websites: many(website),
	teams: many(team),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
	organization: one(organization, {
		fields: [team.organizationId],
		references: [organization.id],
	}),
	teamMembers: many(teamMember),
	invitations: many(invitation),
	websites: many(website),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
	team: one(team, {
		fields: [teamMember.teamId],
		references: [team.id],
	}),
	user: one(user, {
		fields: [teamMember.userId],
		references: [user.id],
	}),
}));

export const memberRelations = relations(member, ({ one, many }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
	notificationSettings: many(memberNotificationSetting),
}));

export const memberNotificationSettingRelations = relations(
	memberNotificationSetting,
	({ one }) => ({
		member: one(member, {
			fields: [memberNotificationSetting.memberId],
			references: [member.id],
		}),
		organization: one(organization, {
			fields: [memberNotificationSetting.organizationId],
			references: [organization.id],
		}),
	})
);

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	inviter: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
	team: one(team, {
		fields: [invitation.teamId],
		references: [team.id],
	}),
}));

export type OrganizationSelect = InferSelectModel<typeof organization>;
export type OrganizationInsert = InferInsertModel<typeof organization>;

export type UserSelect = InferSelectModel<typeof user>;
export type UserInsert = InferInsertModel<typeof user>;

export type SessionSelect = InferSelectModel<typeof session>;
export type SessionInsert = InferInsertModel<typeof session>;

export type AccountSelect = InferSelectModel<typeof account>;
export type AccountInsert = InferInsertModel<typeof account>;

export type VerificationSelect = InferSelectModel<typeof verification>;
export type VerificationInsert = InferInsertModel<typeof verification>;

export type MemberSelect = InferSelectModel<typeof member>;
export type MemberInsert = InferInsertModel<typeof member>;

export type MemberNotificationSettingSelect = InferSelectModel<
	typeof memberNotificationSetting
>;
export type MemberNotificationSettingInsert = InferInsertModel<
	typeof memberNotificationSetting
>;

export type InvitationSelect = InferSelectModel<typeof invitation>;
export type InvitationInsert = InferInsertModel<typeof invitation>;

export type TeamSelect = InferSelectModel<typeof team>;
export type TeamInsert = InferInsertModel<typeof team>;

export type TeamMemberSelect = InferSelectModel<typeof teamMember>;
export type TeamMemberInsert = InferInsertModel<typeof teamMember>;
