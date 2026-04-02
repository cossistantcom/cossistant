import { getWebsiteByIdWithAccess } from "@api/db/queries/website";
import { postSlackWebhookMessage } from "@api/utils/slack-webhook";
import {
	type SubmitOpenSourceProgramApplicationRequest,
	submitOpenSourceProgramApplicationRequestSchema,
	submitOpenSourceProgramApplicationResponseSchema,
} from "@plasma/types";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";

function buildQualificationSummary(
	input: SubmitOpenSourceProgramApplicationRequest
) {
	const lines: string[] = [];

	if (input.qualificationReasons.includes("github-stars")) {
		lines.push(`GitHub stars: ${input.githubStars ?? "unknown"}`);
	}

	if (input.qualificationReasons.includes("real-users")) {
		lines.push(
			`Real users / traffic: ${input.realUsersOrTrafficProof?.trim() ?? "n/a"}`
		);
	}

	if (input.qualificationReasons.includes("saas-product")) {
		lines.push(`SaaS product: ${input.saasProductProof?.trim() ?? "n/a"}`);
	}

	return lines.join("\n");
}

function buildChecklistSummary(
	input: SubmitOpenSourceProgramApplicationRequest
) {
	return [
		`Public repo: ${input.acknowledgePublicRepo ? "yes" : "no"}`,
		`Recent commits: ${input.acknowledgeRecentCommits ? "yes" : "no"}`,
		`Keep widget mention: ${input.acknowledgeWidgetMention ? "yes" : "no"}`,
		`Add README badge: ${input.acknowledgeReadmeBadge ? "yes" : "no"}`,
	].join("\n");
}

function buildSlackBlocks(params: {
	input: SubmitOpenSourceProgramApplicationRequest;
	user: {
		id: string;
		name?: string | null;
		email?: string | null;
	};
	website: {
		id: string;
		name: string;
		domain: string;
		organizationId: string;
	};
}) {
	const { input, user, website } = params;
	const monetizationSummary = input.isMonetized
		? input.monthlyRecurringRevenueUsd != null
			? `$${input.monthlyRecurringRevenueUsd.toLocaleString("en-US")} MRR`
			: "Monetized (MRR not shared)"
		: "Not monetized";

	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "New OSS program application",
			},
		},
		{
			type: "section",
			fields: [
				{
					type: "mrkdwn",
					text: `*Applicant*\n${user.name || "Unknown"}\n${user.email || "No email"}`,
				},
				{
					type: "mrkdwn",
					text: `*Submitted at*\n${new Date().toISOString()}`,
				},
				{
					type: "mrkdwn",
					text: `*Website*\n${website.name}\n${website.domain}`,
				},
				{
					type: "mrkdwn",
					text: `*Website ID*\n${website.id}`,
				},
			],
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Repository*\n${input.repositoryUrl}`,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Qualification path*\n${buildQualificationSummary(input)}`,
			},
		},
		{
			type: "section",
			fields: [
				{
					type: "mrkdwn",
					text: `*Monetization*\n${monetizationSummary}`,
				},
				{
					type: "mrkdwn",
					text: `*Organization ID*\n${website.organizationId}`,
				},
			],
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Acknowledgements*\n${buildChecklistSummary(input)}`,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Notes*\n${input.notes?.trim() || "None provided"}`,
			},
		},
	];
}

export const openSourceProgramRouter = createTRPCRouter({
	submitApplication: protectedProcedure
		.input(submitOpenSourceProgramApplicationRequestSchema)
		.output(submitOpenSourceProgramApplicationResponseSchema)
		.mutation(async ({ ctx, input }) => {
			const website = await getWebsiteByIdWithAccess(ctx.db, {
				userId: ctx.user.id,
				websiteId: input.websiteId,
			});

			if (!website) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this website.",
				});
			}

			try {
				await postSlackWebhookMessage({
					text: `New OSS program application from ${ctx.user.email ?? ctx.user.id}`,
					blocks: buildSlackBlocks({
						input,
						user: ctx.user,
						website: {
							id: website.id,
							name: website.name,
							domain: website.domain,
							organizationId: website.organizationId,
						},
					}),
				});
			} catch (error) {
				console.error(
					"[open-source-program] Failed to post Slack webhook:",
					error
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send OSS program application.",
				});
			}

			return {
				success: true as const,
				message: "Your OSS program application has been sent for review.",
			};
		}),
});
