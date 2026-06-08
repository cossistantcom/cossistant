import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import {
	ulidNullableReference,
	ulidPrimaryKey,
	ulidReference,
} from "../../utils/db/ids";
import { session, user } from "./auth";

export const jwks = pgTable("jwks", {
	id: ulidPrimaryKey("id"),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: timestamp("created_at").notNull(),
	expiresAt: timestamp("expires_at"),
});

export const oauthClient = pgTable(
	"oauth_client",
	{
		id: ulidPrimaryKey("id"),
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		disabled: boolean("disabled").default(false),
		skipConsent: boolean("skip_consent"),
		enableEndSession: boolean("enable_end_session"),
		subjectType: text("subject_type"),
		scopes: text("scopes").array(),
		userId: ulidNullableReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
		name: text("name"),
		uri: text("uri"),
		icon: text("icon"),
		contacts: text("contacts").array(),
		tos: text("tos"),
		policy: text("policy"),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		redirectUris: text("redirect_uris").array().notNull(),
		postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		grantTypes: text("grant_types").array(),
		responseTypes: text("response_types").array(),
		public: boolean("public"),
		type: text("type"),
		requirePKCE: boolean("require_pkce"),
		referenceId: text("reference_id"),
		metadata: jsonb("metadata"),
	},
	(table) => [
		index("oauth_client_user_id_idx").on(table.userId),
		index("oauth_client_reference_id_idx").on(table.referenceId),
	]
);

export const oauthRefreshToken = pgTable(
	"oauth_refresh_token",
	{
		id: ulidPrimaryKey("id"),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: ulidNullableReference("session_id").references(
			() => session.id,
			{
				onDelete: "set null",
			}
		),
		userId: ulidReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		referenceId: text("reference_id"),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at"),
		revoked: timestamp("revoked"),
		authTime: timestamp("auth_time"),
		scopes: text("scopes").array().notNull(),
	},
	(table) => [
		index("oauth_refresh_token_client_id_idx").on(table.clientId),
		index("oauth_refresh_token_session_id_idx").on(table.sessionId),
		index("oauth_refresh_token_user_id_idx").on(table.userId),
		index("oauth_refresh_token_reference_id_idx").on(table.referenceId),
	]
);

export const oauthAccessToken = pgTable(
	"oauth_access_token",
	{
		id: ulidPrimaryKey("id"),
		token: text("token").unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: ulidNullableReference("session_id").references(
			() => session.id,
			{
				onDelete: "set null",
			}
		),
		userId: ulidNullableReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		referenceId: text("reference_id"),
		refreshId: ulidNullableReference("refresh_id").references(
			() => oauthRefreshToken.id,
			{
				onDelete: "cascade",
			}
		),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at"),
		scopes: text("scopes").array().notNull(),
	},
	(table) => [
		index("oauth_access_token_client_id_idx").on(table.clientId),
		index("oauth_access_token_session_id_idx").on(table.sessionId),
		index("oauth_access_token_user_id_idx").on(table.userId),
		index("oauth_access_token_refresh_id_idx").on(table.refreshId),
		index("oauth_access_token_reference_id_idx").on(table.referenceId),
	]
);

export const oauthConsent = pgTable(
	"oauth_consent",
	{
		id: ulidPrimaryKey("id"),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		userId: ulidNullableReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		referenceId: text("reference_id"),
		scopes: text("scopes").array().notNull(),
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
	},
	(table) => [
		index("oauth_consent_client_id_idx").on(table.clientId),
		index("oauth_consent_user_id_idx").on(table.userId),
		index("oauth_consent_reference_id_idx").on(table.referenceId),
	]
);

export type JwksSelect = InferSelectModel<typeof jwks>;
export type JwksInsert = InferInsertModel<typeof jwks>;

export type OAuthClientSelect = InferSelectModel<typeof oauthClient>;
export type OAuthClientInsert = InferInsertModel<typeof oauthClient>;

export type OAuthRefreshTokenSelect = InferSelectModel<
	typeof oauthRefreshToken
>;
export type OAuthRefreshTokenInsert = InferInsertModel<
	typeof oauthRefreshToken
>;

export type OAuthAccessTokenSelect = InferSelectModel<typeof oauthAccessToken>;
export type OAuthAccessTokenInsert = InferInsertModel<typeof oauthAccessToken>;

export type OAuthConsentSelect = InferSelectModel<typeof oauthConsent>;
export type OAuthConsentInsert = InferInsertModel<typeof oauthConsent>;
