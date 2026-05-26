import type { Database } from "@api/db";
import { isEmailSuppressed } from "@api/db/queries/email-bounce";
import {
	getOrganizationOwnerEmailRecipients,
	getWebsiteOpenRouterByokAlertConfig,
	type OpenRouterByokAlertConfig,
	type OpenRouterByokAlertRecipient,
} from "@api/db/queries/openrouter-byok";
import {
	OpenRouterByokProblemAlert,
	sendBatchEmail,
} from "@cossistant/transactional";
import type { WebsiteOpenRouterContext } from "./resolver";

const ALERT_KEY_PREFIX = "openrouter-byok:alert:v1";
const ALERT_TTL_SECONDS = 86_400;

type RedisLike = {
	set: (
		key: string,
		value: string,
		...args: Array<string | number>
	) => Promise<string | null>;
};

type SendBatchEmail = typeof sendBatchEmail;

export type OpenRouterByokAlertDeps = {
	redis?: RedisLike;
	sendBatchEmail: SendBatchEmail;
	getAlertConfig: (
		db: Database,
		params: { organizationId: string; websiteId: string }
	) => Promise<OpenRouterByokAlertConfig | null>;
	getOwnerRecipients: (
		db: Database,
		params: { organizationId: string }
	) => Promise<OpenRouterByokAlertRecipient[]>;
	isEmailSuppressed: (
		db: Database,
		params: { email: string; organizationId: string }
	) => Promise<boolean>;
	now: () => Date;
	appUrl: string;
};

export type OpenRouterByokAlertStatus =
	| "sent"
	| "throttled"
	| "redis_failed"
	| "no_enabled_key"
	| "no_recipients"
	| "send_failed";

export type OpenRouterByokAlertResult = {
	status: OpenRouterByokAlertStatus;
	recipientCount: number;
};

function normalizeBaseUrl(value: string): string {
	const trimmed = value.trim().replace(/\/+$/, "");
	return trimmed || "https://cossistant.com";
}

function resolveAlertDeps(
	overrides?: Partial<OpenRouterByokAlertDeps>
): OpenRouterByokAlertDeps {
	return {
		redis: overrides?.redis,
		sendBatchEmail: overrides?.sendBatchEmail ?? sendBatchEmail,
		getAlertConfig:
			overrides?.getAlertConfig ?? getWebsiteOpenRouterByokAlertConfig,
		getOwnerRecipients:
			overrides?.getOwnerRecipients ?? getOrganizationOwnerEmailRecipients,
		isEmailSuppressed: overrides?.isEmailSuppressed ?? isEmailSuppressed,
		now: overrides?.now ?? (() => new Date()),
		appUrl: normalizeBaseUrl(
			overrides?.appUrl ?? process.env.PUBLIC_APP_URL ?? ""
		),
	};
}

export function buildOpenRouterByokAlertKey(params: {
	websiteId: string;
	recipientEmail: string;
}): string {
	return `${ALERT_KEY_PREFIX}:${params.websiteId}:${params.recipientEmail
		.trim()
		.toLowerCase()}`;
}

function buildOpenRouterByokAlertBatchKey(params: {
	websiteId: string;
	checkedAt: string;
}): string {
	return `${ALERT_KEY_PREFIX}:batch:${params.websiteId}:${params.checkedAt}`;
}

function buildDeveloperSettingsUrl(params: {
	appUrl: string;
	websiteSlug: string;
}): string {
	return `${params.appUrl}/${params.websiteSlug}/settings/developers`;
}

function uniqueRecipientsByEmail(
	recipients: OpenRouterByokAlertRecipient[]
): OpenRouterByokAlertRecipient[] {
	const seen = new Set<string>();
	const uniqueRecipients: OpenRouterByokAlertRecipient[] = [];

	for (const recipient of recipients) {
		const normalizedEmail = recipient.email.trim().toLowerCase();
		if (!(normalizedEmail && !seen.has(normalizedEmail))) {
			continue;
		}
		seen.add(normalizedEmail);
		uniqueRecipients.push({
			...recipient,
			email: recipient.email.trim(),
		});
	}

	return uniqueRecipients;
}

async function filterSuppressedRecipients(params: {
	db: Database;
	organizationId: string;
	recipients: OpenRouterByokAlertRecipient[];
	deps: OpenRouterByokAlertDeps;
}): Promise<OpenRouterByokAlertRecipient[]> {
	const checks = await Promise.all(
		params.recipients.map(async (recipient) => {
			try {
				const suppressed = await params.deps.isEmailSuppressed(params.db, {
					email: recipient.email,
					organizationId: params.organizationId,
				});
				return suppressed ? null : recipient;
			} catch (error) {
				console.warn(
					"[openrouter-byok] failed to check email suppression for alert recipient",
					{
						organizationId: params.organizationId,
						userId: recipient.userId,
						error,
					}
				);
				return null;
			}
		})
	);

	return checks.filter(
		(recipient): recipient is OpenRouterByokAlertRecipient => recipient !== null
	);
}

export async function maybeSendOpenRouterByokProblemAlert(params: {
	context: WebsiteOpenRouterContext;
	errorCode: string;
	checkedAt?: string;
	deps?: Partial<OpenRouterByokAlertDeps>;
}): Promise<OpenRouterByokAlertResult> {
	const deps = resolveAlertDeps(params.deps);
	const checkedAt = params.checkedAt ?? deps.now().toISOString();
	const alertConfig = await deps.getAlertConfig(params.context.db, {
		organizationId: params.context.organizationId,
		websiteId: params.context.websiteId,
	});

	if (!alertConfig?.enabled) {
		return { status: "no_enabled_key", recipientCount: 0 };
	}

	const recipients = uniqueRecipientsByEmail(
		await deps.getOwnerRecipients(params.context.db, {
			organizationId: params.context.organizationId,
		})
	);
	const deliverableRecipients = await filterSuppressedRecipients({
		db: params.context.db,
		organizationId: params.context.organizationId,
		recipients,
		deps,
	});

	if (deliverableRecipients.length === 0) {
		return { status: "no_recipients", recipientCount: 0 };
	}

	let unthrottledRecipients: OpenRouterByokAlertRecipient[];
	try {
		const redis = deps.redis ?? (await import("@api/redis")).getRedis();
		const throttleResults = await Promise.all(
			deliverableRecipients.map(async (recipient) => {
				const alertKey = buildOpenRouterByokAlertKey({
					websiteId: params.context.websiteId,
					recipientEmail: recipient.email,
				});
				const result = await redis.set(
					alertKey,
					checkedAt,
					"EX",
					ALERT_TTL_SECONDS,
					"NX"
				);
				return result === "OK" ? recipient : null;
			})
		);
		unthrottledRecipients = throttleResults.filter(
			(recipient): recipient is OpenRouterByokAlertRecipient =>
				recipient !== null
		);
	} catch (error) {
		console.warn("[openrouter-byok] skipped problem alert after Redis error", {
			organizationId: params.context.organizationId,
			websiteId: params.context.websiteId,
			errorCode: params.errorCode,
			error,
		});
		return { status: "redis_failed", recipientCount: 0 };
	}

	if (unthrottledRecipients.length === 0) {
		return { status: "throttled", recipientCount: 0 };
	}

	const settingsUrl = buildDeveloperSettingsUrl({
		appUrl: deps.appUrl,
		websiteSlug: alertConfig.website.slug,
	});

	try {
		await deps.sendBatchEmail(
			unthrottledRecipients.map((recipient) => ({
				to: recipient.email,
				subject: `OpenRouter key needs attention - ${alertConfig.website.name}`,
				variant: "notifications",
				react: OpenRouterByokProblemAlert({
					website: alertConfig.website,
					maskedKey: alertConfig.maskedKey,
					errorCode: params.errorCode,
					checkedAt,
					settingsUrl,
				}),
				tags: [
					{ name: "category", value: "openrouter_byok" },
					{ name: "website_id", value: params.context.websiteId },
				],
			})),
			{
				idempotencyKey: buildOpenRouterByokAlertBatchKey({
					websiteId: params.context.websiteId,
					checkedAt,
				}),
			}
		);
	} catch (error) {
		console.warn("[openrouter-byok] failed to send problem alert", {
			organizationId: params.context.organizationId,
			websiteId: params.context.websiteId,
			errorCode: params.errorCode,
			error,
		});
		return {
			status: "send_failed",
			recipientCount: unthrottledRecipients.length,
		};
	}

	return { status: "sent", recipientCount: unthrottledRecipients.length };
}
