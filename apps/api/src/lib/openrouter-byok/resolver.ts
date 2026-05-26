import type { Database } from "@api/db";
import {
	getWebsiteOpenRouterKey,
	markWebsiteOpenRouterKeyConnectionStatus,
} from "@api/db/queries/openrouter-byok";
import { website } from "@api/db/schema";
import { env } from "@api/env";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { and, eq, isNull } from "drizzle-orm";
import { maybeSendOpenRouterByokProblemAlert } from "./alerts";
import { decryptOpenRouterApiKey } from "./encryption";

export type OpenRouterBillingSource =
	| "cossistant"
	| "customer_openrouter"
	| "cossistant_platform";

export type OpenRouterCredentialMode =
	| "auto"
	| "customer"
	| "cossistant_platform";

export type WebsiteOpenRouterContext = {
	db: Database;
	organizationId: string;
	websiteId: string;
};

export type ResolvedOpenRouterCredentials = {
	apiKey: string;
	billingSource: OpenRouterBillingSource;
};

const BYOK_FALLBACK_PAUSE_MS = 15 * 60 * 1000;

type OpenRouterByokErrorCode =
	| "website_not_found"
	| "decrypt_failed"
	| "missing_cossistant_key";

export class OpenRouterByokError extends Error {
	constructor(
		code: OpenRouterByokErrorCode,
		message: string,
		options?: { cause?: unknown }
	) {
		super(message, options);
		this.name = "OpenRouterByokError";
		this.code = code;
	}

	readonly code: OpenRouterByokErrorCode;
}

function sanitizeErrorCode(value: string): string {
	return value
		.trim()
		.replace(/[^a-zA-Z0-9_.:-]+/g, "_")
		.slice(0, 80);
}

function getStatusCode(error: unknown): number | null {
	if (!(error && typeof error === "object" && "statusCode" in error)) {
		return null;
	}

	const statusCode = (error as { statusCode?: unknown }).statusCode;
	return typeof statusCode === "number" && Number.isInteger(statusCode)
		? statusCode
		: null;
}

export function normalizeOpenRouterByokErrorCode(error: unknown): string {
	if (error instanceof OpenRouterByokError) {
		return error.code;
	}

	const statusCode = getStatusCode(error);
	if (statusCode !== null) {
		return `openrouter_http_${statusCode}`;
	}

	if (error instanceof Error && error.name) {
		return sanitizeErrorCode(error.name) || "provider_error";
	}

	return "provider_error";
}

function getCossistantOpenRouterKey(): string {
	if (!env.OPENROUTER_API_KEY) {
		throw new OpenRouterByokError(
			"missing_cossistant_key",
			"OPENROUTER_API_KEY is not configured. Please set it in your environment variables."
		);
	}

	return env.OPENROUTER_API_KEY;
}

function isFutureTimestamp(value: string | null | undefined): boolean {
	if (!value) {
		return false;
	}

	const parsed = Date.parse(value);
	return !Number.isNaN(parsed) && parsed > Date.now();
}

function getFallbackPausedUntil(): string {
	return new Date(Date.now() + BYOK_FALLBACK_PAUSE_MS).toISOString();
}

export async function resolveOpenRouterCredentialsForWebsite(
	context: WebsiteOpenRouterContext,
	options: { mode?: OpenRouterCredentialMode } = {}
): Promise<ResolvedOpenRouterCredentials> {
	if (options.mode === "cossistant_platform") {
		return {
			apiKey: getCossistantOpenRouterKey(),
			billingSource: "cossistant_platform",
		};
	}

	const site = await context.db.query.website.findFirst({
		where: and(
			eq(website.id, context.websiteId),
			eq(website.organizationId, context.organizationId),
			isNull(website.deletedAt)
		),
	});

	if (!site) {
		throw new OpenRouterByokError(
			"website_not_found",
			"Website not found while resolving OpenRouter credentials."
		);
	}

	const [planInfo, keyConfig] = await Promise.all([
		getPlanForWebsite(site),
		getWebsiteOpenRouterKey(context.db, {
			organizationId: context.organizationId,
			websiteId: context.websiteId,
		}),
	]);

	const canUseByok = planInfo.features["openrouter-byok"] === true;
	if (!(canUseByok && keyConfig?.enabled)) {
		return {
			apiKey: getCossistantOpenRouterKey(),
			billingSource: "cossistant",
		};
	}

	if (
		options.mode !== "customer" &&
		isFutureTimestamp(keyConfig.fallbackPausedUntil)
	) {
		return {
			apiKey: getCossistantOpenRouterKey(),
			billingSource: "cossistant_platform",
		};
	}

	try {
		return {
			apiKey: decryptOpenRouterApiKey({
				encryptedApiKey: keyConfig.encryptedApiKey,
				secret: env.API_KEY_SECRET,
			}),
			billingSource: "customer_openrouter",
		};
	} catch (error) {
		const byokError = new OpenRouterByokError(
			"decrypt_failed",
			"Saved OpenRouter key could not be decrypted. Replace the key or disable BYOK.",
			{ cause: error }
		);
		await recordOpenRouterByokFailure({
			context,
			billingSource: "customer_openrouter",
			error: byokError,
			errorCode: "decrypt_failed",
			sendAlert: true,
			pauseFallback: true,
		}).catch((recordError) => {
			console.warn("[openrouter-byok] failed to record decrypt failure", {
				organizationId: context.organizationId,
				websiteId: context.websiteId,
				error: recordError,
			});
		});

		throw byokError;
	}
}

export async function recordOpenRouterByokSuccess(params: {
	context: WebsiteOpenRouterContext;
	billingSource: OpenRouterBillingSource | undefined;
}): Promise<void> {
	if (params.billingSource !== "customer_openrouter") {
		return;
	}

	await markWebsiteOpenRouterKeyConnectionStatus(params.context.db, {
		organizationId: params.context.organizationId,
		websiteId: params.context.websiteId,
		status: "valid",
		errorCode: null,
	}).catch((error) => {
		console.warn("[openrouter-byok] failed to record success", {
			organizationId: params.context.organizationId,
			websiteId: params.context.websiteId,
			error,
		});
	});
}

export async function recordOpenRouterByokFailure(params: {
	context: WebsiteOpenRouterContext;
	billingSource: OpenRouterBillingSource | undefined;
	error?: unknown;
	errorCode?: string;
	sendAlert?: boolean;
	pauseFallback?: boolean;
}): Promise<void> {
	if (params.billingSource !== "customer_openrouter") {
		return;
	}

	const errorCode =
		params.errorCode ??
		(params.error
			? normalizeOpenRouterByokErrorCode(params.error)
			: "provider_error");
	const checkedAt = new Date().toISOString();
	const fallbackPausedUntil =
		params.pauseFallback === false ? undefined : getFallbackPausedUntil();

	await markWebsiteOpenRouterKeyConnectionStatus(params.context.db, {
		organizationId: params.context.organizationId,
		websiteId: params.context.websiteId,
		status: "invalid",
		errorCode,
		checkedAt,
		fallbackPausedUntil,
	}).catch((error) => {
		console.warn("[openrouter-byok] failed to record failure", {
			organizationId: params.context.organizationId,
			websiteId: params.context.websiteId,
			error,
		});
	});

	if (params.sendAlert !== true) {
		return;
	}

	await maybeSendOpenRouterByokProblemAlert({
		context: params.context,
		errorCode,
		checkedAt,
	}).catch((error) => {
		console.warn("[openrouter-byok] failed to send failure alert", {
			organizationId: params.context.organizationId,
			websiteId: params.context.websiteId,
			errorCode,
			error,
		});
	});
}
