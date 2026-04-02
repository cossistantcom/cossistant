import { env } from "@api/env";
import { sendEmail, TeamInvitationEmail } from "@plasma/transactional";
import React from "react";

type SendTeamInvitationEmailParams = {
	email: string;
	organizationName: string;
	organizationSlug: string;
	inviterName: string | null;
	invitationId: string;
};

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Failed to send invitation email.";
}

export async function sendTeamInvitationEmail(
	params: SendTeamInvitationEmailParams
): Promise<{ success: boolean; errorMessage?: string }> {
	const appUrl = env.PUBLIC_APP_URL || "http://localhost:3000";
	const joinUrl = new URL(
		`/welcome/${params.organizationSlug}/join/${params.invitationId}`,
		appUrl
	).toString();

	try {
		const result = await sendEmail({
			to: params.email,
			subject: `Join ${params.organizationName} on Cossistant`,
			react: (
				<TeamInvitationEmail
					inviterName={params.inviterName}
					joinUrl={joinUrl}
					organizationName={params.organizationName}
					recipientEmail={params.email}
				/>
			),
			variant: "notifications",
		});

		if (result.error) {
			const errorMessage = toErrorMessage(result.error);
			console.error(
				`Failed to send invitation email to ${params.email}: ${errorMessage}`
			);
			return {
				success: false,
				errorMessage,
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		const errorMessage = toErrorMessage(error);
		console.error(
			`Failed to send invitation email to ${params.email}: ${errorMessage}`
		);
		return {
			success: false,
			errorMessage,
		};
	}
}
