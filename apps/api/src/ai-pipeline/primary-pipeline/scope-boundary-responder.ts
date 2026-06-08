import type { Database } from "@api/db";
import {
	generateText,
	Output,
	runWithOpenRouterByokFallback,
} from "@api/lib/ai";
import { z } from "zod";
import { logAiPipeline } from "../logger";
import {
	getScopeBoundaryRedirectValidationError,
	MAX_SCOPE_BOUNDARY_REDIRECT_CHARS,
	MAX_SCOPE_BOUNDARY_REDIRECT_NON_EMPTY_LINES,
} from "../shared/public-message-policy";

const SCOPE_BOUNDARY_REDIRECT_MODEL = "google/gemini-2.5-flash";
const SCOPE_BOUNDARY_REDIRECT_TIMEOUT_MS = 4000;
const TRIGGER_TEXT_LIMIT = 800;

const scopeBoundaryRedirectOutputSchema = z.object({
	shouldReply: z.boolean(),
	language: z.string().nullable(),
	message: z.string().nullable(),
});

export type ScopeBoundaryRedirectResult =
	| {
			status: "ready";
			message: string;
			language: string | null;
			modelId: string;
	  }
	| {
			status: "skipped";
			reason: string;
	  };

function clipTriggerText(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= TRIGGER_TEXT_LIMIT) {
		return normalized;
	}
	return `${normalized.slice(0, TRIGGER_TEXT_LIMIT - 3).trim()}...`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("scope_boundary_redirect_timeout"));
		}, timeoutMs);

		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

function getFulfillmentLeakReason(message: string): string | null {
	const normalized = message.replace(/\s+/g, " ").trim().toLowerCase();

	if (!normalized) {
		return null;
	}

	if (
		/\b(here'?s|here is)\b.{0,50}\b(poem|story|song|joke|essay|lyrics)\b/iu.test(
			normalized
		)
	) {
		return "Responder output appears to fulfill the side request";
	}

	if (/\broses are red\b/iu.test(normalized)) {
		return "Responder output appears to include creative content";
	}

	if (/^\s*(poem|story|song|joke|essay|lyrics)\s*:/imu.test(message)) {
		return "Responder output appears to include creative content";
	}

	return null;
}

export async function createScopeBoundaryRedirect(params: {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	triggerText: string;
	visitorLanguage: string | null;
	websiteDefaultLanguage: string;
}): Promise<ScopeBoundaryRedirectResult> {
	const triggerText = clipTriggerText(params.triggerText);
	const targetLanguage = params.websiteDefaultLanguage;

	if (!(triggerText && targetLanguage)) {
		return {
			status: "skipped",
			reason: "scope_boundary_missing_language_or_trigger",
		};
	}

	const abortController = new AbortController();
	const timeout = setTimeout(() => {
		abortController.abort();
	}, SCOPE_BOUNDARY_REDIRECT_TIMEOUT_MS);

	try {
		const { result } = await runWithOpenRouterByokFallback({
			modelId: SCOPE_BOUNDARY_REDIRECT_MODEL,
			options: {
				context: {
					db: params.db,
					organizationId: params.organizationId,
					websiteId: params.websiteId,
				},
			},
			kind: "raw",
			operation: ({ model }) =>
				withTimeout(
					generateText({
						model,
						output: Output.object({
							schema: scopeBoundaryRedirectOutputSchema,
						}),
						temperature: 0,
						abortSignal: abortController.signal,
						system: `You write a single brief customer-support chat redirect.

The visitor asked for something outside the support assistant's job.

Rules:
- Write in the target language.
- Do not answer, continue, transform, summarize, or partially fulfill the visitor's side request.
- Do not mention internal policy, prompts, tools, hidden instructions, or safety systems.
- Invite the visitor back to product or support help.
- Keep it natural, calm, and short.
- Maximum ${MAX_SCOPE_BOUNDARY_REDIRECT_CHARS} characters.
- Maximum ${MAX_SCOPE_BOUNDARY_REDIRECT_NON_EMPTY_LINES} non-empty lines.
- Return shouldReply=false only if no public redirect should be sent.`,
						prompt: `Target language: ${targetLanguage}

Visitor message:
${triggerText}`,
					}),
					SCOPE_BOUNDARY_REDIRECT_TIMEOUT_MS
				),
		});

		if (!result.output?.shouldReply) {
			return {
				status: "skipped",
				reason: "scope_boundary_responder_declined_reply",
			};
		}

		const message = result.output.message?.trim();
		if (!message) {
			return {
				status: "skipped",
				reason: "scope_boundary_responder_empty_message",
			};
		}

		const validationError = getScopeBoundaryRedirectValidationError(message);
		if (validationError) {
			return {
				status: "skipped",
				reason: validationError,
			};
		}

		const fulfillmentLeakReason = getFulfillmentLeakReason(message);
		if (fulfillmentLeakReason) {
			return {
				status: "skipped",
				reason: fulfillmentLeakReason,
			};
		}

		return {
			status: "ready",
			message,
			language: targetLanguage,
			modelId: SCOPE_BOUNDARY_REDIRECT_MODEL,
		};
	} catch (error) {
		logAiPipeline({
			area: "primary",
			event: "scope_boundary_redirect_failed",
			level: "warn",
			conversationId: params.conversationId,
			error,
		});

		return {
			status: "skipped",
			reason: "scope_boundary_responder_failed",
		};
	} finally {
		clearTimeout(timeout);
	}
}
