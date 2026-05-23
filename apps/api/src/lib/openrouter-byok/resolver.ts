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

export type OpenRouterBillingSource = "cossistant" | "customer_openrouter";

export type WebsiteOpenRouterContext = {
	db: Database;
	organizationId: string;
	websiteId: string;
};

export type ResolvedOpenRouterCredentials = {
	apiKey: string;
	billingSource: OpenRouterBillingSource;
};

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

export async function resolveOpenRouterCredentialsForWebsite(
	context: WebsiteOpenRouterContext
): Promise<ResolvedOpenRouterCredentials> {
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

	try {
		return {
			apiKey: decryptOpenRouterApiKey({
				encryptedApiKey: keyConfig.encryptedApiKey,
				secret: env.API_KEY_SECRET,
			}),
			billingSource: "customer_openrouter",
		};
	} catch (error) {
		const checkedAt = new Date().toISOString();
		await markWebsiteOpenRouterKeyConnectionStatus(context.db, {
			organizationId: context.organizationId,
			websiteId: context.websiteId,
			status: "invalid",
			errorCode: "decrypt_failed",
			checkedAt,
		}).catch((statusError) => {
			console.warn("[openrouter-byok] failed to record decrypt failure", {
				organizationId: context.organizationId,
				websiteId: context.websiteId,
				error: statusError,
			});
		});
		await maybeSendOpenRouterByokProblemAlert({
			context,
			errorCode: "decrypt_failed",
			checkedAt,
		}).catch((alertError) => {
			console.warn("[openrouter-byok] failed to send decrypt failure alert", {
				organizationId: context.organizationId,
				websiteId: context.websiteId,
				error: alertError,
			});
		});

		throw new OpenRouterByokError(
			"decrypt_failed",
			"Saved OpenRouter key could not be decrypted. Replace the key or disable BYOK.",
			{ cause: error }
		);
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
	error: unknown;
}): Promise<void> {
	if (params.billingSource !== "customer_openrouter") {
		return;
	}

	const errorCode = normalizeOpenRouterByokErrorCode(params.error);
	const checkedAt = new Date().toISOString();

	await markWebsiteOpenRouterKeyConnectionStatus(params.context.db, {
		organizationId: params.context.organizationId,
		websiteId: params.context.websiteId,
		status: "invalid",
		errorCode,
		checkedAt,
	}).catch((error) => {
		console.warn("[openrouter-byok] failed to record failure", {
			organizationId: params.context.organizationId,
			websiteId: params.context.websiteId,
			error,
		});
	});
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
