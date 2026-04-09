import { sentinelClient } from "@better-auth/infra/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { getApiOrigin } from "@/lib/url";

export const authClient = createAuthClient({
	baseURL: `${getApiOrigin()}/api/auth`,
	fetchOptions: {
		credentials: "include" as const,
	},
	plugins: [organizationClient(), adminClient()],
});

// Alias requestPasswordReset as forgetPassword for backwards compatibility
export const forgetPassword = authClient.requestPasswordReset;
export const { signIn, signUp, signOut, resetPassword } = authClient;

export type Session = typeof authClient.$Infer.Session;
export type User = typeof authClient.$Infer.Session.user;
