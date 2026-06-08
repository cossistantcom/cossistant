import { env } from "@api/env";
import { getRateLimitStore } from "@api/lib/rate-limit-store";
import { extractClientIpFromRequest } from "@api/utils/client-ip";
import type { Context, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";

const isDevelopment = env.NODE_ENV !== "production";

function getUnverifiedJwtRateLimitSubject(
	authHeader: string | undefined
): string {
	const token = authHeader?.startsWith("Bearer ")
		? authHeader.slice("Bearer ".length)
		: null;
	const payload = token?.split(".")[1];

	if (!payload) {
		return "anonymous";
	}

	try {
		const normalized = payload
			.replaceAll("-", "+")
			.replaceAll("_", "/")
			.padEnd(Math.ceil(payload.length / 4) * 4, "=");
		const json = JSON.parse(atob(normalized)) as Record<string, unknown>;
		const userId = typeof json.sub === "string" ? json.sub : "unknown-user";
		const clientId =
			typeof json.client_id === "string"
				? json.client_id
				: typeof json.azp === "string"
					? json.azp
					: "unknown-client";
		return `${userId}:${clientId}`;
	} catch {
		return "invalid-token";
	}
}

/**
 * Default rate limiter for general API endpoints
 * Allows 300 requests per minute per IP in development
 * Allows 100 requests per minute per IP in production
 */
export const defaultRateLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minute
	limit: isDevelopment ? 300 : 100,
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		return ip;
	},
	store: getRateLimitStore(),
	message: "Too many requests, please try again later.",
	skip: (c: Context) => {
		// Skip rate limiting for health checks
		return c.req.path === "/health";
	},
});

/**
 * Strict rate limiter for authentication endpoints
 * Allows 5 requests per minute per IP
 */
export const authRateLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minute
	limit: 30, // 5 requests per minute
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		return `auth:${ip}`;
	},
	store: getRateLimitStore(),
	message: "Too many authentication attempts, please try again later.",
});

/**
 * Rate limiter for TRPC endpoints
 * Allows 200 requests per minute per IP in development (more forgiving)
 * Allows 100 requests per minute per IP in production
 */
export const trpcRateLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minute
	limit: isDevelopment ? 200 : 100, // More forgiving in development
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		return `trpc:${ip}`;
	},
	store: getRateLimitStore(),
	message: {
		error: "Too many requests",
		code: "TOO_MANY_REQUESTS",
		message: "Rate limit exceeded. Please try again later.",
	},
});

/**
 * Rate limiter for WebSocket connections
 * Allows 30 connections per minute per IP in development
 * Allows 10 connections per minute per IP in production
 */
export const websocketRateLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minute
	limit: isDevelopment ? 30 : 10,
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		return `ws:${ip}`;
	},
	store: getRateLimitStore(),
	message: "Too many WebSocket connection attempts, please try again later.",
});

/**
 * Rate limiter for remote MCP traffic.
 * Keeps browser and agent retries bounded before token verification and tool work.
 */
export const mcpRateLimiter = rateLimiter({
	windowMs: 60 * 1000,
	limit: isDevelopment ? 120 : 60,
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		const subject = getUnverifiedJwtRateLimitSubject(
			c.req.header("Authorization")
		);
		return `mcp:${ip}:${subject}`;
	},
	store: getRateLimitStore(),
	message: {
		error: "Too many requests",
		code: "TOO_MANY_REQUESTS",
		message: "MCP rate limit exceeded. Please try again later.",
	},
});

/**
 * Custom rate limiter factory for specific endpoints
 */
export function createCustomRateLimiter(options: {
	windowMs?: number;
	limit: number;
	keyPrefix?: string;
	message?: string | Record<string, unknown>;
}) {
	return rateLimiter({
		windowMs: options.windowMs || 60 * 1000, // Default 1 minute
		limit: options.limit,
		standardHeaders: "draft-6",
		keyGenerator: (c: Context) => {
			const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
			return options.keyPrefix ? `${options.keyPrefix}:${ip}` : ip;
		},
		store: getRateLimitStore(),
		message: options.message || "Too many requests, please try again later.",
	});
}
