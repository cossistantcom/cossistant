import { ConversationStatus } from "@plasma/types";
import type { InboxView } from "@plasma/types/schemas";
import { getSiteOrigin } from "@/lib/site-url";

/**
 * Check if a website slug is valid (not an internal Next.js/webpack path)
 * This prevents queries from firing for invalid slugs like __webpack_hmr
 */
export function isValidWebsiteSlug(slug: string | undefined | null): boolean {
	if (!slug) {
		return false;
	}
	// Reject internal paths that might be caught by dynamic routes
	if (slug.startsWith("__") || slug.startsWith("_next")) {
		return false;
	}
	// Reject empty or whitespace-only slugs
	if (!slug.trim()) {
		return false;
	}
	return true;
}

export function getApiOrigin() {
	if (process.env.NEXT_PUBLIC_API_BASE_URL) {
		return process.env.NEXT_PUBLIC_API_BASE_URL;
	}

	return process.env.NODE_ENV === "development"
		? "http://localhost:8787"
		: "https://api.cossistant.com";
}

export function getAPIBaseUrl(path: `/${string}`) {
	return `${getApiOrigin()}/api${path}`;
}

export function getTRPCUrl() {
	return `${getApiOrigin()}/trpc`;
}

const HTTP_REGEX = /^http/;

export function getWebSocketUrl() {
	return `${getApiOrigin().replace(HTTP_REGEX, "ws")}/ws`;
}

export function getLandingBaseUrl() {
	return getSiteOrigin();
}

export function extractInboxParamsFromSlug({
	slug,
	availableViews,
	websiteSlug,
}: {
	slug: string[];
	availableViews: InboxView[];
	websiteSlug: string;
}): {
	selectedViewId: string | null;
	selectedConversationStatus: ConversationStatus | "archived" | null;
	selectedConversationId: string | null;
	basePath: string;
} {
	const selectedViewId: string | null = null;
	const basePath = `/${slug.join("/")}`;

	const selectedConversationStatus: ConversationStatus | "archived" | null =
		slug?.find(
			(segment) =>
				segment === "archived" ||
				segment === ConversationStatus.OPEN ||
				segment === ConversationStatus.RESOLVED ||
				segment === ConversationStatus.SPAM
		) ?? null;

	// If within the slug array a string starts with "CO", then it is a conversation id
	const selectedConversationId =
		slug?.find((segment) => segment.startsWith("CO")) ?? null;

	if (!slug || slug.length === 0) {
		return {
			selectedViewId: null,
			selectedConversationStatus,
			selectedConversationId: null,
			basePath,
		};
	}

	if (slug.length === 1 && selectedConversationId) {
		return {
			selectedViewId,
			selectedConversationStatus,
			selectedConversationId,
			basePath,
		};
	}

	return {
		selectedViewId,
		selectedConversationStatus,
		selectedConversationId,
		basePath,
	};
}
