import {
	defaultShouldDehydrateQuery,
	QueryClient,
} from "@tanstack/react-query";
import superjson from "superjson";

const AUTH_ERROR_CODES = new Set(["UNAUTHORIZED", "FORBIDDEN"]);
const RATE_LIMIT_ERROR_CODES = new Set(["TOO_MANY_REQUESTS"]);

function getErrorObject(error: unknown): Record<string, unknown> | null {
	if (!error) {
		return null;
	}

	if (typeof error === "object" && error !== null) {
		return error as Record<string, unknown>;
	}

	return null;
}

function getErrorData(errorObj: Record<string, unknown>) {
	if (typeof errorObj.data === "object" && errorObj.data !== null) {
		return errorObj.data as Record<string, unknown>;
	}

	return null;
}

function hasErrorCode(error: unknown, codes: ReadonlySet<string>): boolean {
	const errorObj = getErrorObject(error);
	if (!errorObj) {
		return false;
	}

	const data = getErrorData(errorObj);
	const dataCode = data?.code;
	const directCode = errorObj.code;

	if (typeof dataCode === "string" && codes.has(dataCode)) {
		return true;
	}

	if (typeof directCode === "string" && codes.has(directCode)) {
		return true;
	}

	const message = errorObj.message;
	if (typeof message === "string") {
		return [...codes].some((code) => message.includes(code));
	}

	return false;
}

function getHttpStatus(error: unknown): number | null {
	const errorObj = getErrorObject(error);
	if (!errorObj) {
		return null;
	}

	const data = getErrorData(errorObj);
	const dataStatus = data?.httpStatus ?? data?.status;
	const directStatus = errorObj.status;

	if (typeof dataStatus === "number") {
		return dataStatus;
	}

	if (typeof directStatus === "number") {
		return directStatus;
	}

	return null;
}

export function isAuthError(error: unknown): boolean {
	if (hasErrorCode(error, AUTH_ERROR_CODES)) {
		return true;
	}

	const status = getHttpStatus(error);
	return status === 401 || status === 403;
}

export function isRateLimitError(error: unknown): boolean {
	return hasErrorCode(error, RATE_LIMIT_ERROR_CODES);
}

export function shouldRetryRequest(failureCount: number, error: unknown) {
	if (isAuthError(error) || isRateLimitError(error)) {
		return false;
	}

	return failureCount < 3;
}

export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000,
				// Don't retry auth/rate-limit errors to avoid redirect and request cascades.
				retry: shouldRetryRequest,
				// Use exponential backoff with longer delays for rate limit errors
				retryDelay: (attemptIndex, error) => {
					if (isRateLimitError(error)) {
						// Much longer delay for rate limit errors: 5s, 10s, 20s...
						return Math.min(5000 * 2 ** attemptIndex, 60_000);
					}
					// Standard exponential backoff: 1s, 2s, 4s... (max 30s)
					return Math.min(1000 * 2 ** attemptIndex, 30_000);
				},
			},
			mutations: {
				// Also prevent mutation retries on auth/rate-limit errors.
				retry: shouldRetryRequest,
			},
			dehydrate: {
				serializeData: superjson.serialize,
				shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query),
			},
			hydrate: {
				deserializeData: superjson.deserialize,
			},
		},
	});
}
