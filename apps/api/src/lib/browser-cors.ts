import { cors } from "hono/cors";

const DEFAULT_API_BROWSER_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:8081",
	"https://cossistant.com",
	"https://www.cossistant.com",
] as const;

export const API_BROWSER_CORS_MAX_AGE_SECONDS = 86_400;

function normalizeOrigin(raw: string | null | undefined): string | null {
	if (!raw) {
		return null;
	}

	try {
		return new URL(raw).origin;
	} catch {
		return null;
	}
}

function setVaryHeader(headers: Headers, value: string): void {
	const existing = headers.get("Vary");
	const parts = new Set(
		(existing ?? "")
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean)
	);

	parts.add(value);
	headers.set("Vary", [...parts].join(", "));
}

export function getApiBrowserCorsOrigins(): string[] {
	const origins = new Set<string>(DEFAULT_API_BROWSER_ORIGINS);
	const configuredOrigin = normalizeOrigin(process.env.PUBLIC_APP_URL);

	if (configuredOrigin) {
		origins.add(configuredOrigin);
	}

	return [...origins];
}

export function resolveApiBrowserCorsOrigin(
	requestOrigin: string | null | undefined
): string | null {
	const normalizedOrigin = normalizeOrigin(requestOrigin);

	if (!normalizedOrigin) {
		return null;
	}

	return getApiBrowserCorsOrigins().includes(normalizedOrigin)
		? normalizedOrigin
		: null;
}

export function applyApiBrowserCorsResponseHeaders(params: {
	headers: Headers;
	requestOrigin: string | null | undefined;
}): string | null {
	setVaryHeader(params.headers, "Origin");

	const allowOrigin = resolveApiBrowserCorsOrigin(params.requestOrigin);

	if (!allowOrigin) {
		return null;
	}

	params.headers.set("Access-Control-Allow-Origin", allowOrigin);
	params.headers.set("Access-Control-Allow-Credentials", "true");

	return allowOrigin;
}

export function createApiBrowserPreflightResponse(params: {
	requestOrigin: string | null | undefined;
	requestHeaders?: string | null | undefined;
	allowMethods?: readonly string[];
}): Response {
	const headers = new Headers();
	const allowOrigin = applyApiBrowserCorsResponseHeaders({
		headers,
		requestOrigin: params.requestOrigin,
	});

	if (!allowOrigin) {
		return new Response(null, {
			headers,
			status: 204,
			statusText: "No Content",
		});
	}

	headers.set(
		"Access-Control-Max-Age",
		API_BROWSER_CORS_MAX_AGE_SECONDS.toString()
	);
	headers.set(
		"Access-Control-Allow-Methods",
		(params.allowMethods ?? ["POST", "OPTIONS"]).join(", ")
	);

	if (params.requestHeaders?.trim()) {
		headers.set("Access-Control-Allow-Headers", params.requestHeaders);
		setVaryHeader(headers, "Access-Control-Request-Headers");
	}

	return new Response(null, {
		headers,
		status: 204,
		statusText: "No Content",
	});
}

export function createApiBrowserCorsMiddleware() {
	return cors({
		credentials: true,
		maxAge: API_BROWSER_CORS_MAX_AGE_SECONDS,
		origin: (origin) => resolveApiBrowserCorsOrigin(origin),
	});
}
