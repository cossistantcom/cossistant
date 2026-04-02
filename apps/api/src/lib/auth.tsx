import { db } from "@api/db";
import * as schema from "@api/db/schema";
import { env } from "@api/env";
import { generateULID } from "@api/utils/db/ids";
import { dash } from "@better-auth/infra";
import { ResetPasswordEmail, sendEmail } from "@plasma/transactional";
import { polar, portal, usage } from "@polar-sh/better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";

import {
	admin,
	anonymous,
	organization as organizationPlugin,
} from "better-auth/plugins";
import React from "react";
import { syncUserToDefaultResendAudience } from "./auth-user-audience";

import polarClient from "./polar";

// Needed for email templates
export const auth = betterAuth({
	baseURL:
		process.env.BETTER_AUTH_URL ||
		(process.env.NODE_ENV === "production"
			? "https://api.plasma-pandora.com"
			: "http://localhost:8787"),
	secret: process.env.BETTER_AUTH_SECRET || undefined,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			...schema,
		},
	}),
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await syncUserToDefaultResendAudience(user);
				},
			},
		},
	},
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
		sendResetPassword: async ({ user, url, token }, request) => {
			try {
				await sendEmail({
					to: user.email,
					subject: "Reset your password",
					react: (
						<ResetPasswordEmail
							email={user.email}
							name={user.name}
							resetUrl={url}
						/>
					),
					variant: "notifications",
				});
				console.log(`Password reset email sent to ${user.email}`);
			} catch (error) {
				console.error("Failed to send password reset email:", error);
				throw new Error("Failed to send password reset email");
			}
		},
	},
	plugins: [
		organizationPlugin({
			teams: {
				enabled: true,
				maximumTeams: 100, // Allow up to 100 teams per organization
				allowRemovingAllTeams: false, // Prevent removing the last team
			},
			organizationCreation: {
				disabled: false,
				afterCreate: async ({ organization, member, user }, request) => {
					console.log("organization created", organization);
					console.log("member", member);
					console.log("user", user);

					// Create Polar customer for organization
					try {
						// Check if customer already exists
						try {
							const existingCustomer = await polarClient.customers.getExternal({
								externalId: organization.id,
							});

							if (existingCustomer) {
								console.log(
									`Polar customer already exists for organization ${organization.id}`
								);
								return;
							}
						} catch (error) {
							// Customer doesn't exist, continue to create
						}

						// Create customer with organization ID as external ID
						await polarClient.customers.create({
							email: user.email,
							name: user.name || undefined,
							externalId: organization.id,
						});

						console.log(
							`Created Polar customer for organization ${organization.id}`
						);
					} catch (error) {
						// Handle "email already exists" error gracefully
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						const errorString = JSON.stringify(error);

						const isEmailExistsError =
							(errorMessage.includes("email") &&
								errorMessage.includes("already exists")) ||
							errorString.includes("email") ||
							(errorString.includes("already exists") &&
								errorString.includes("customer"));

						if (isEmailExistsError) {
							console.warn(
								`Customer with email ${user.email} already exists in Polar. Skipping customer creation for organization ${organization.id}.`
							);
						} else {
							console.error(
								`Error creating Polar customer for organization ${organization.id}:`,
								error
							);
							// Don't throw error to avoid blocking organization creation
						}
					}
				},
			},
		}),
		anonymous(),
		admin(),
		// Type assertion needed due to version mismatch between @polar-sh/better-auth and better-auth
		polar({
			client: polarClient,
			createCustomerOnSignUp: false,
			use: [portal(), usage()],
		}),
	],
	// Allow requests from the frontend development server and production domains
	trustedOrigins: [
		"http://localhost:3000",
		"http://localhost:3001",
		"https://plasma-pandora.com",
		"https://plasma-pandora.com",
		"https://www.plasma-pandora.com",
		"https://www.plasma-pandora.com",
		"https://api.plasma-pandora.com",
	],
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
			scope: ["openid", "email", "profile"],
		},
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
			scope: ["user:email", "read:user"],
		},
	},
	advanced: {
		useSecureCookies: env.NODE_ENV === "production",
		defaultCookieAttributes: {
			secure: env.NODE_ENV === "production",
			httpOnly: true,
			sameSite: env.NODE_ENV === "production" ? "none" : "lax",
			path: "/",
		},
		crossSubDomainCookies: {
			enabled: true,
			domain: env.NODE_ENV === "production" ? ".plasma-pandora.com" : undefined,
		},
		// Add cookie prefix for better organization
		cookiePrefix: "cossistant-auth",
		// Generate ULID for the database
		database: {
			generateId() {
				return generateULID();
			},
		},
	},
	session: {
		// Cache the session in the cookie for 60 seconds
		// This is to avoid hitting the database for each request
		cookieCache: {
			enabled: true,
			maxAge: 60,
		},
	},
}) satisfies ReturnType<typeof betterAuth>;

export type AuthType = {
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
};

export type OrigamiUser = typeof auth.$Infer.Session.user;
export type OrigamiSession = typeof auth.$Infer.Session.session;
