import type { LifecycleEmailEventSelect } from "@api/db/schema";
import {
	LIFECYCLE_EMAIL_KEYS,
	type LifecycleEmailKey,
	type LifecycleEmailMetadata,
} from "./types";

type WeeklyDigestStats = {
	current: WeeklyDigestMetricSnapshot;
	previous: WeeklyDigestMetricSnapshot;
};

type WeeklyDigestMetricSnapshot = {
	conversations: number;
	uniqueVisitors: number;
	aiHandledRate: number | null;
	medianFirstResponseSeconds: number | null;
	medianResolutionSeconds: number | null;
};

type BuildLifecycleEmailParams = {
	appUrl: string;
	event: Pick<LifecycleEmailEventSelect, "emailKey" | "metadata">;
	organizationName: string;
	recipientName?: string | null;
	weeklyDigestStats?: WeeklyDigestStats;
};

type LifecycleEmailContent = {
	subject: string;
	text: string;
};

function firstName(name: string | null | undefined) {
	return name?.trim().split(/\s+/)[0] || "there";
}

function cleanAppUrl(appUrl: string) {
	return appUrl.replace(/\/$/, "");
}

function settingsLine(appUrl: string) {
	return `You can turn marketing emails off in Cossistant settings: ${cleanAppUrl(
		appUrl
	)}/select`;
}

function getMetadata(event: Pick<LifecycleEmailEventSelect, "metadata">) {
	return (event.metadata ?? null) as LifecycleEmailMetadata;
}

function websiteUrl(appUrl: string, websiteSlug?: string) {
	return websiteSlug
		? `${cleanAppUrl(appUrl)}/${websiteSlug}/settings`
		: `${cleanAppUrl(appUrl)}/select`;
}

function buildWelcomeEmail(params: BuildLifecycleEmailParams) {
	return {
		subject: "Welcome to Cossistant",
		text: `Hey ${firstName(params.recipientName)},

Anthony here, founder of Cossistant.

Glad you're here.

The best first step is simple: add the widget to your site and send yourself one test message.

Open Cossistant:
${cleanAppUrl(params.appUrl)}/select

If anything feels unclear, reply to this email. I read it.

Anthony

${settingsLine(params.appUrl)}`,
	};
}

function buildSetupWidgetEmail(params: BuildLifecycleEmailParams) {
	const metadata = getMetadata(params.event);

	return {
		subject: "Quick Cossistant setup check",
		text: `Hey ${firstName(params.recipientName)},

Small nudge from me.

If ${metadata?.websiteName ?? "your site"} is not live with the Cossistant widget yet, that is the one thing worth doing today.

Once the widget is installed, send one test conversation. It catches almost every setup mistake in two minutes.

Open the settings:
${websiteUrl(params.appUrl, metadata?.websiteSlug)}

Anthony

${settingsLine(params.appUrl)}`,
	};
}

function buildCustomizeWidgetEmail(params: BuildLifecycleEmailParams) {
	const metadata = getMetadata(params.event);

	return {
		subject: "Make Cossistant feel like your product",
		text: `Hey ${firstName(params.recipientName)},

Tiny thing that helps conversion: make the support widget feel like it belongs to your product.

Check the name, logo, welcome tone, and the first question you ask visitors.

It should sound like you, not like a generic support bot.

Open ${metadata?.websiteName ?? "your site"}:
${websiteUrl(params.appUrl, metadata?.websiteSlug)}

Anthony

${settingsLine(params.appUrl)}`,
	};
}

function buildFeedbackEmail(params: BuildLifecycleEmailParams) {
	const metadata = getMetadata(params.event);

	return {
		subject: "A simple feedback loop",
		text: `Hey ${firstName(params.recipientName)},

One habit I recommend: read your first few Cossistant conversations like product feedback.

People will tell you what is confusing, what they expected, and where your site is losing them.

Even quiet accounts learn a lot from one or two real visitor questions.

Open the inbox:
${metadata?.websiteSlug ? `${cleanAppUrl(params.appUrl)}/${metadata.websiteSlug}/inbox` : `${cleanAppUrl(params.appUrl)}/select`}

Anthony

${settingsLine(params.appUrl)}`,
	};
}

function buildAiAgentHelpEmail(params: BuildLifecycleEmailParams) {
	const metadata = getMetadata(params.event);

	return {
		subject: "Get more help from your AI agent",
		text: `Hey ${firstName(params.recipientName)},

Your AI agent is only useful when it has the same context you would give a new teammate.

Add your best docs, FAQs, pricing answers, and product details. Then test it with the questions your visitors actually ask.

The goal is not magic. It is fewer repeated support replies for you.

Open your AI agent:
${metadata?.websiteSlug ? `${cleanAppUrl(params.appUrl)}/${metadata.websiteSlug}/ai-agent` : `${cleanAppUrl(params.appUrl)}/select`}

Anthony

${settingsLine(params.appUrl)}`,
	};
}

const EMPTY_WEEKLY_DIGEST_STATS: WeeklyDigestStats = {
	current: {
		conversations: 0,
		uniqueVisitors: 0,
		aiHandledRate: null,
		medianFirstResponseSeconds: null,
		medianResolutionSeconds: null,
	},
	previous: {
		conversations: 0,
		uniqueVisitors: 0,
		aiHandledRate: null,
		medianFirstResponseSeconds: null,
		medianResolutionSeconds: null,
	},
};

function formatPercentDelta(current: number, previous: number) {
	if (previous === 0) {
		return current > 0 ? "new vs last week" : "0% vs last week";
	}

	const delta = Math.round(((current - previous) / previous) * 100);
	return `${delta > 0 ? "+" : ""}${delta}% vs last week`;
}

function formatPointDelta(current: number | null, previous: number | null) {
	if (current === null || previous === null) {
		return null;
	}

	const delta = Math.round(current - previous);
	return `${delta > 0 ? "+" : ""}${delta} pts vs last week`;
}

function formatDuration(seconds: number | null) {
	if (seconds === null) {
		return "-";
	}

	const totalSeconds = Math.max(0, Math.round(seconds));
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}

	const totalMinutes = Math.floor(totalSeconds / 60);
	const remainingSeconds = totalSeconds % 60;
	if (totalMinutes < 60) {
		return remainingSeconds > 0
			? `${totalMinutes}m ${remainingSeconds}s`
			: `${totalMinutes}m`;
	}

	const hours = Math.floor(totalMinutes / 60);
	const remainingMinutes = totalMinutes % 60;
	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function withDelta(value: string, delta: string | null) {
	return delta ? `${value} (${delta})` : value;
}

function formatWeeklyDigestRows(stats: WeeklyDigestStats) {
	const { current, previous } = stats;

	return [
		`Conversations: ${withDelta(
			String(current.conversations),
			formatPercentDelta(current.conversations, previous.conversations)
		)}`,
		`Unique visitors: ${withDelta(
			String(current.uniqueVisitors),
			formatPercentDelta(current.uniqueVisitors, previous.uniqueVisitors)
		)}`,
		`AI handled: ${withDelta(
			current.aiHandledRate === null
				? "-"
				: `${Math.round(current.aiHandledRate)}%`,
			formatPointDelta(current.aiHandledRate, previous.aiHandledRate)
		)}`,
		`Median first response: ${withDelta(
			formatDuration(current.medianFirstResponseSeconds),
			current.medianFirstResponseSeconds === null ||
				previous.medianFirstResponseSeconds === null
				? null
				: formatPercentDelta(
						current.medianFirstResponseSeconds,
						previous.medianFirstResponseSeconds
					)
		)}`,
		`Median resolution: ${withDelta(
			formatDuration(current.medianResolutionSeconds),
			current.medianResolutionSeconds === null ||
				previous.medianResolutionSeconds === null
				? null
				: formatPercentDelta(
						current.medianResolutionSeconds,
						previous.medianResolutionSeconds
					)
		)}`,
	].join("\n");
}

function weeklyDigestUrl(appUrl: string, websiteSlug?: string) {
	return websiteSlug
		? `${cleanAppUrl(appUrl)}/${websiteSlug}/inbox`
		: `${cleanAppUrl(appUrl)}/select`;
}

function buildWeeklyDigestEmail(params: BuildLifecycleEmailParams) {
	const metadata = getMetadata(params.event);
	const websiteName =
		metadata?.websiteName?.trim() || params.organizationName || "your site";
	const stats = params.weeklyDigestStats ?? EMPTY_WEEKLY_DIGEST_STATS;
	const statsRows = formatWeeklyDigestRows(stats);
	const quiet = stats.current.conversations === 0;

	return {
		subject: websiteName,
		text: quiet
			? `Hey ${firstName(params.recipientName)},

Quiet week for ${websiteName} in Cossistant.

No new conversations came in. That can be fine, but it is worth checking two things:

1. Is the widget installed where visitors can actually find it?
2. Does the first message invite a real question?

${statsRows}

Open ${websiteName}:
${weeklyDigestUrl(params.appUrl, metadata?.websiteSlug)}

Anthony

Weekly digests can be turned off in Organization preferences.
${settingsLine(params.appUrl)}`
			: `Hey ${firstName(params.recipientName)},

Here is your Cossistant week for ${websiteName}, kept short.

${statsRows}

Open ${websiteName}:
${weeklyDigestUrl(params.appUrl, metadata?.websiteSlug)}

Anthony

Weekly digests can be turned off in Organization preferences.
${settingsLine(params.appUrl)}`,
	};
}

function buildLimitWarningEmail(params: BuildLifecycleEmailParams) {
	const metadata = getMetadata(params.event);
	const limitName = metadata?.limitName ?? "usage";
	const used = metadata?.limitUsed ?? 0;
	const limit = metadata?.limitValue ?? 0;
	const unit = metadata?.limitUnit ?? "used";

	return {
		subject: `Cossistant ${limitName} limit heads up`,
		text: `Hey ${firstName(params.recipientName)},

Quick heads up: ${metadata?.websiteName ?? "your site"} is getting close to its ${limitName} limit.

Current usage: ${used} / ${limit} ${unit}

Nothing is broken. I just want you to have time to clean up, adjust usage, or upgrade before it becomes annoying.

Open Cossistant:
${metadata?.websiteSlug ? `${cleanAppUrl(params.appUrl)}/${metadata.websiteSlug}/settings/plan` : `${cleanAppUrl(params.appUrl)}/select`}

Anthony

${settingsLine(params.appUrl)}`,
	};
}

export function buildLifecycleEmail(
	params: BuildLifecycleEmailParams
): LifecycleEmailContent {
	const emailKey = params.event.emailKey as LifecycleEmailKey;

	switch (emailKey) {
		case LIFECYCLE_EMAIL_KEYS.WELCOME:
			return buildWelcomeEmail(params);
		case LIFECYCLE_EMAIL_KEYS.SETUP_WIDGET:
			return buildSetupWidgetEmail(params);
		case LIFECYCLE_EMAIL_KEYS.CUSTOMIZE_WIDGET:
			return buildCustomizeWidgetEmail(params);
		case LIFECYCLE_EMAIL_KEYS.COLLECT_FEEDBACK:
			return buildFeedbackEmail(params);
		case LIFECYCLE_EMAIL_KEYS.AI_AGENT_HELP:
			return buildAiAgentHelpEmail(params);
		case LIFECYCLE_EMAIL_KEYS.WEEKLY_DIGEST:
			return buildWeeklyDigestEmail(params);
		case LIFECYCLE_EMAIL_KEYS.LIMIT_WARNING:
			return buildLimitWarningEmail(params);
		default:
			return {
				subject: "Cossistant update",
				text: `Hey ${firstName(params.recipientName)},

Short Cossistant update from me.

Open Cossistant:
${cleanAppUrl(params.appUrl)}/select

Anthony

${settingsLine(params.appUrl)}`,
			};
	}
}
