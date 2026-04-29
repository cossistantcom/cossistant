import type { IdentifyContactResponse } from "@cossistant/types/api/contact";
import type {
	CreateConversationRequestBody,
	CreateConversationResponseBody,
	GetConversationRequest,
	GetConversationResponse,
	GetConversationSeenDataResponse,
	ListConversationsRequest,
	ListConversationsResponse,
	MarkConversationSeenRequestBody,
	MarkConversationSeenResponseBody,
	SetConversationTypingRequestBody,
	SetConversationTypingResponseBody,
	SubmitConversationRatingRequestBody,
	SubmitConversationRatingResponseBody,
} from "@cossistant/types/api/conversation";
import type {
	SubmitFeedbackRequest,
	SubmitFeedbackResponse,
} from "@cossistant/types/api/feedback";
import type {
	SupportFeatureFlagMutationRequest,
	SupportFeatureFlagMutationResponse,
	SupportOnboardingUpdateRequest,
	SupportStateResponse,
} from "@cossistant/types/api/support";
import type {
	GetConversationTimelineItemsRequest,
	GetConversationTimelineItemsResponse,
	SendTimelineItemRequest,
	SendTimelineItemResponse,
} from "@cossistant/types/api/timeline-item";
import type {
	GenerateUploadUrlRequest,
	GenerateUploadUrlResponse,
} from "@cossistant/types/api/upload";
import { logger } from "./logger";
import { resolvePublicKey } from "./resolve-public-key";
import {
	CossistantAPIError,
	type CossistantConfig,
	PRESENCE_PING_INTERVAL_MS,
	type PublicWebsiteResponse,
	type UpdateVisitorRequest,
	type VisitorActivityRequest,
	type VisitorMetadata,
	type VisitorResponse,
} from "./types";
import {
	isAllowedMimeType,
	MAX_FILE_SIZE,
	validateFile,
} from "./upload-constants";
import { generateConversationId } from "./utils";
import { collectVisitorData } from "./visitor-data";
import {
	getExistingVisitorId,
	getVisitorId,
	setVisitorId,
} from "./visitor-tracker";

const VISITOR_SESSION_STORAGE_KEY_PREFIX = "cossistant:visitor-session:";

type CollectedVisitorData = Awaited<ReturnType<typeof collectVisitorData>>;

function createVisitorSessionId() {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}

	return `visitor_session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export class CossistantRestClient {
	private config: CossistantConfig;
	private baseHeaders: Record<string, string>;
	private publicKey: string;
	private websiteId: string | null = null;
	private visitorId: string | null = null;
	private visitorBlocked = false;
	private lastTrackedPageUrl: string | null = null;
	private stopVisitorTracking: (() => void) | null = null;
	private visitorActivitySessionId: string | null = null;
	private visitorActivitySessionKey: string | null = null;

	constructor(config: CossistantConfig) {
		this.config = config;

		this.publicKey = config.publicKey
			? (resolvePublicKey(config.publicKey) ?? "")
			: config.apiKey
				? ""
				: (resolvePublicKey() ?? "");
		const privateKey = config.apiKey?.trim() ?? "";

		if (!(this.publicKey || privateKey)) {
			throw new Error(
				"Public or private API key is required. Provide publicKey for browser usage, apiKey for server usage, or set the appropriate environment variable: NEXT_PUBLIC_COSSISTANT_API_KEY (Next.js), VITE_COSSISTANT_API_KEY (Vite), or COSSISTANT_API_KEY (other)."
			);
		}

		this.baseHeaders = {
			"Content-Type": "application/json",
		};

		if (this.publicKey) {
			this.baseHeaders["X-Public-Key"] = this.publicKey;
		}

		if (privateKey) {
			this.baseHeaders.Authorization = `Bearer ${privateKey}`;
		}

		if (config.userId) {
			this.baseHeaders["X-User-ID"] = config.userId;
		}

		if (config.organizationId) {
			this.baseHeaders["X-Organization-ID"] = config.organizationId;
		}
	}

	private normalizeVisitorResponse(payload: VisitorResponse): VisitorResponse {
		const contact = payload.contact ? payload.contact : null;
		return {
			...payload,
			// Ensure latitude and longitude are numbers or null
			latitude:
				typeof payload.latitude === "string"
					? Number.parseFloat(payload.latitude)
					: payload.latitude,
			longitude:
				typeof payload.longitude === "string"
					? Number.parseFloat(payload.longitude)
					: payload.longitude,
			createdAt: payload.createdAt,
			updatedAt: payload.updatedAt,
			lastSeenAt: payload.lastSeenAt ? payload.lastSeenAt : null,
			blockedAt: payload.blockedAt ? payload.blockedAt : null,
			attribution: payload.attribution ?? null,
			currentPage: payload.currentPage ?? null,
			contact: payload.contact ? payload.contact : null,
		};
	}

	private resolveVisitorId(): string {
		if (this.visitorId) {
			return this.visitorId;
		}

		if (this.websiteId) {
			const storedVisitorId = getVisitorId(this.websiteId);
			if (storedVisitorId) {
				this.visitorId = storedVisitorId;
				return storedVisitorId;
			}
		}

		throw new Error("Visitor ID is required");
	}

	private getVisitorActivitySessionId(visitorId: string): string {
		const sessionKey = this.websiteId
			? `${VISITOR_SESSION_STORAGE_KEY_PREFIX}${this.websiteId}:${visitorId}`
			: null;

		if (
			sessionKey &&
			this.visitorActivitySessionKey === sessionKey &&
			this.visitorActivitySessionId
		) {
			return this.visitorActivitySessionId;
		}

		if (sessionKey && typeof window !== "undefined") {
			try {
				const existing = window.sessionStorage.getItem(sessionKey);
				if (existing) {
					this.visitorActivitySessionKey = sessionKey;
					this.visitorActivitySessionId = existing;
					return existing;
				}

				const created = createVisitorSessionId();
				window.sessionStorage.setItem(sessionKey, created);
				this.visitorActivitySessionKey = sessionKey;
				this.visitorActivitySessionId = created;
				return created;
			} catch {
				// Fall through to in-memory fallback below.
			}
		}

		if (!this.visitorActivitySessionId) {
			this.visitorActivitySessionId = createVisitorSessionId();
		}

		this.visitorActivitySessionKey = sessionKey;
		return this.visitorActivitySessionId;
	}

	private async postVisitorActivity(
		visitorId: string,
		activityType: VisitorActivityRequest["activityType"],
		options: {
			visitorData?: CollectedVisitorData;
		} = {}
	): Promise<void> {
		const visitorData = options.visitorData ?? (await collectVisitorData());
		const attribution = visitorData?.attribution ?? null;
		const currentPage = visitorData?.currentPage ?? null;

		if (!(attribution && currentPage)) {
			return;
		}

		await this.request(`/visitors/${visitorId}/activity`, {
			method: "POST",
			body: JSON.stringify({
				sessionId: this.getVisitorActivitySessionId(visitorId),
				activityType,
				attribution,
				currentPage,
				occurredAt: currentPage.updatedAt,
			} satisfies VisitorActivityRequest),
			headers: {
				"X-Visitor-Id": visitorId,
			},
		});
	}

	private async syncVisitorSnapshot(
		visitorId: string,
		options: {
			force?: boolean;
			visitorData?: CollectedVisitorData;
		} = {}
	): Promise<boolean> {
		try {
			const visitorData = options.visitorData ?? (await collectVisitorData());
			if (!visitorData) {
				return false;
			}

			const nextPageUrl = visitorData.currentPage?.url ?? null;
			if (
				!options.force &&
				nextPageUrl &&
				nextPageUrl === this.lastTrackedPageUrl
			) {
				return false;
			}

			const payload = Object.entries(visitorData).reduce<
				Partial<UpdateVisitorRequest>
			>((acc, [key, value]) => {
				if (value === null || value === undefined) {
					return acc;
				}
				(acc as Record<string, unknown>)[key] = value;
				return acc;
			}, {});

			if (Object.keys(payload).length === 0) {
				return false;
			}

			await this.request<VisitorResponse>(`/visitors/${visitorId}`, {
				method: "PATCH",
				body: JSON.stringify(payload),
				headers: {
					"X-Visitor-Id": visitorId,
				},
			});

			if (nextPageUrl) {
				this.lastTrackedPageUrl = nextPageUrl;
			}
			return true;
		} catch (error) {
			logger.warn("Failed to sync visitor data", error);
			return false;
		}
	}

	private stopTracking(): void {
		this.stopVisitorTracking?.();
		this.stopVisitorTracking = null;
		this.lastTrackedPageUrl = null;
	}

	private startVisitorTracking(visitorId: string): void {
		if (typeof window === "undefined" || typeof document === "undefined") {
			return;
		}

		this.stopTracking();

		void (async () => {
			const visitorData = await collectVisitorData();
			await this.syncVisitorSnapshot(visitorId, {
				force: true,
				visitorData,
			});
			await this.postVisitorActivity(visitorId, "connected", {
				visitorData,
			});
		})();

		const syncRouteChange = () => {
			void (async () => {
				const visitorData = await collectVisitorData();
				const didSync = await this.syncVisitorSnapshot(visitorId, {
					visitorData,
				});

				if (didSync) {
					await this.postVisitorActivity(visitorId, "route_change", {
						visitorData,
					});
				}
			})();
		};

		const sendActivity = (
			activityType: VisitorActivityRequest["activityType"]
		) => {
			void this.postVisitorActivity(visitorId, activityType);
		};

		const historyObject = window.history;
		const originalPushState = historyObject.pushState.bind(historyObject);
		const originalReplaceState = historyObject.replaceState.bind(historyObject);

		const scheduleSync = () => {
			setTimeout(syncRouteChange, 0);
		};

		historyObject.pushState = ((...args: Parameters<History["pushState"]>) => {
			originalPushState(...args);
			scheduleSync();
		}) as History["pushState"];

		historyObject.replaceState = ((
			...args: Parameters<History["replaceState"]>
		) => {
			originalReplaceState(...args);
			scheduleSync();
		}) as History["replaceState"];

		let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

		const stopHeartbeatTimer = () => {
			if (heartbeatTimer !== null) {
				clearInterval(heartbeatTimer);
				heartbeatTimer = null;
			}
		};

		const startHeartbeatTimer = () => {
			stopHeartbeatTimer();

			if (document.visibilityState === "hidden") {
				return;
			}

			heartbeatTimer = setInterval(() => {
				sendActivity("heartbeat");
			}, PRESENCE_PING_INTERVAL_MS);
		};

		const handleFocus = () => {
			sendActivity("focus");
			startHeartbeatTimer();
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				stopHeartbeatTimer();
				return;
			}

			sendActivity("focus");
			startHeartbeatTimer();
		};

		window.addEventListener("focus", handleFocus);
		window.addEventListener("popstate", syncRouteChange);
		window.addEventListener("hashchange", syncRouteChange);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		startHeartbeatTimer();

		this.stopVisitorTracking = () => {
			stopHeartbeatTimer();
			historyObject.pushState = originalPushState;
			historyObject.replaceState = originalReplaceState;
			window.removeEventListener("focus", handleFocus);
			window.removeEventListener("popstate", syncRouteChange);
			window.removeEventListener("hashchange", syncRouteChange);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}

	private async request<T>(
		path: string,
		options: RequestInit = {}
	): Promise<T> {
		if (this.visitorBlocked) {
			const method = (options.method ?? "GET").toUpperCase();
			const [rawPath] = path.split("?");
			const normalizedPath = rawPath?.endsWith("/")
				? rawPath.slice(0, -1)
				: rawPath;
			const isWebsitesRoot = normalizedPath === "/websites";
			const isSafeMethod = method === "GET" || method === "HEAD";

			if (!(isWebsitesRoot && isSafeMethod)) {
				throw new CossistantAPIError({
					code: "VISITOR_BLOCKED",
					message: "Visitor is blocked and cannot perform this action.",
					details: { path, method },
				});
			}
		}

		const url = `${this.config.apiUrl}${path}`;

		const response = await fetch(url, {
			...options,
			headers: {
				...this.baseHeaders,
				...options.headers,
			},
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const statusCode = response.status;
			const errorCode = errorData.code || `HTTP_${statusCode}`;
			const serverMessage = errorData.message;

			// Determine if this is an authentication/authorization error
			const isAuthError =
				statusCode === 401 ||
				statusCode === 403 ||
				errorCode === "UNAUTHORIZED" ||
				errorCode === "FORBIDDEN" ||
				errorCode === "INVALID_API_KEY" ||
				errorCode === "API_KEY_EXPIRED" ||
				errorCode === "API_KEY_MISSING" ||
				errorCode?.toUpperCase().includes("AUTH") ||
				errorCode?.toUpperCase().includes("API_KEY");

			// Use appropriate error message based on error type
			const errorMessage = isAuthError
				? "Your Cossistant public API key is invalid, expired, missing or not authorized to access this resource."
				: serverMessage || `Request failed with status ${statusCode}`;

			// Log with appropriate level based on error type
			if (isAuthError) {
				logger.error(errorMessage, {
					details: errorData.details,
					path,
					status: statusCode,
					code: errorCode,
				});
			} else {
				logger.error("API request failed", {
					message: errorMessage,
					details: errorData.details,
					path,
					status: statusCode,
					code: errorCode,
				});
			}

			throw new CossistantAPIError({
				code: errorCode,
				message: errorMessage,
				details: errorData.details,
			});
		}

		return response.json();
	}

	async getWebsite(): Promise<PublicWebsiteResponse> {
		// Make the request with visitor ID if we have one stored
		const headers: Record<string, string> = {};

		// First, check if we already know the website ID and have a visitor ID for it
		if (this.websiteId) {
			const storedVisitorId = getVisitorId(this.websiteId);
			if (storedVisitorId) {
				headers["X-Visitor-Id"] = storedVisitorId;
			}
		} else {
			// We don't know the website ID yet, but check if we have any existing visitor
			// This prevents creating duplicate visitors on page refresh
			const existingVisitor = getExistingVisitorId(this.publicKey);
			if (existingVisitor) {
				headers["X-Visitor-Id"] = existingVisitor.visitorId;
				// Pre-populate our local state
				this.websiteId = existingVisitor.websiteId;
				this.visitorId = existingVisitor.visitorId;
			}
		}

		const response = await this.request<PublicWebsiteResponse>("/websites", {
			headers,
		});

		// Store the website ID for future requests
		this.websiteId = response.id;

		// Store the visitor ID if we got one
		this.visitorBlocked = response.visitor?.isBlocked ?? false;

		if (response.visitor?.id) {
			if (this.visitorBlocked) {
				this.visitorId = response.visitor.id;
				setVisitorId(response.id, response.visitor.id);
				this.stopTracking();
				return response;
			}

			this.visitorId = response.visitor.id;
			setVisitorId(response.id, response.visitor.id);
			this.startVisitorTracking(response.visitor.id);
		}

		return response;
	}

	// Manually prime website and visitor context when the caller already has it
	setWebsiteContext(websiteId: string, visitorId?: string): void {
		this.websiteId = websiteId;
		if (visitorId) {
			this.visitorId = visitorId;
			setVisitorId(websiteId, visitorId);
		}
	}

	setVisitorBlocked(isBlocked: boolean): void {
		this.visitorBlocked = isBlocked;
		if (isBlocked) {
			this.stopTracking();
		}
	}

	getCurrentWebsiteId(): string | null {
		return this.websiteId;
	}

	getCurrentVisitorId(): string | null {
		if (this.visitorId) {
			return this.visitorId;
		}

		if (!this.websiteId) {
			return null;
		}

		return getVisitorId(this.websiteId) ?? null;
	}

	async updateVisitorMetadata(
		metadata: VisitorMetadata
	): Promise<VisitorResponse> {
		const visitorId = this.resolveVisitorId();
		const response = await this.request<VisitorResponse>(
			`/visitors/${visitorId}/metadata`,
			{
				method: "PATCH",
				body: JSON.stringify({ metadata }),
				headers: {
					"X-Visitor-Id": visitorId,
				},
			}
		);

		return this.normalizeVisitorResponse(response);
	}

	/**
	 * Identify a visitor by creating or updating their contact information
	 * This will link the visitor to a contact record that can be tracked across devices
	 */
	async identify(params: {
		externalId?: string;
		email?: string;
		name?: string;
		image?: string;
		metadata?: Record<string, unknown>;
		contactOrganizationId?: string;
	}): Promise<IdentifyContactResponse> {
		const visitorId = this.resolveVisitorId();

		const response = await this.request<IdentifyContactResponse>(
			"/contacts/identify",
			{
				method: "POST",
				body: JSON.stringify({
					visitorId,
					...params,
				}),
				headers: {
					"X-Visitor-Id": visitorId,
				},
			}
		);

		return {
			contact: {
				...response.contact,
				// Ensure metadata is properly typed
				metadata:
					typeof response.contact.metadata === "string"
						? JSON.parse(response.contact.metadata)
						: response.contact.metadata,
				createdAt: response.contact.createdAt,
				updatedAt: response.contact.updatedAt,
			},
			visitorId: response.visitorId,
		};
	}

	/**
	 * Update metadata for the contact associated with the current visitor
	 * Note: The visitor must be identified first via the identify() method
	 */
	async updateContactMetadata(
		metadata: Record<string, unknown>
	): Promise<VisitorResponse> {
		// This still uses the visitor metadata endpoint for backward compatibility
		// The endpoint will internally update the contact metadata
		return this.updateVisitorMetadata(metadata as VisitorMetadata);
	}

	async createConversation(
		params: Partial<CreateConversationRequestBody> = {}
	): Promise<CreateConversationResponseBody> {
		const conversationId = params.conversationId || generateConversationId();

		// Get visitor ID from storage if we have the website ID, or use the provided one
		const storedVisitorId = this.websiteId
			? getVisitorId(this.websiteId)
			: undefined;
		const visitorId = params.visitorId || this.visitorId || storedVisitorId;

		if (!visitorId) {
			throw new Error("Visitor ID is required");
		}

		const body: CreateConversationRequestBody = {
			conversationId,
			visitorId,
			defaultTimelineItems: params.defaultTimelineItems || [],
			channel: params.channel || "widget",
		};

		// Add visitor ID header if available
		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const response = await this.request<CreateConversationResponseBody>(
			"/conversations",
			{
				method: "POST",
				body: JSON.stringify(body),
				headers,
			}
		);

		// Convert date strings to Date objects
		return {
			conversation: {
				...response.conversation,
				createdAt: response.conversation.createdAt,
				updatedAt: response.conversation.updatedAt,
				deletedAt: response.conversation.deletedAt ?? null,
				lastTimelineItem: response.conversation.lastTimelineItem,
			},
			initialTimelineItems: response.initialTimelineItems,
		};
	}

	async updateConfiguration(config: Partial<CossistantConfig>): Promise<void> {
		if (config.publicKey) {
			this.publicKey = config.publicKey;
			this.baseHeaders["X-Public-Key"] = config.publicKey;
		} else if (config.publicKey === null) {
			const { "X-Public-Key": _, ...rest } = this.baseHeaders;
			this.baseHeaders = rest;
			this.publicKey = "";
		}

		if (config.apiKey) {
			this.baseHeaders.Authorization = `Bearer ${config.apiKey}`;
		} else if (config.apiKey === null) {
			const { Authorization: _, ...rest } = this.baseHeaders;
			this.baseHeaders = rest;
		}

		if (config.userId) {
			this.baseHeaders["X-User-ID"] = config.userId;
		} else if (config.userId === null) {
			const { "X-User-ID": _, ...rest } = this.baseHeaders;
			this.baseHeaders = rest;
		}

		if (config.organizationId) {
			this.baseHeaders["X-Organization-ID"] = config.organizationId;
		} else if (config.organizationId === null) {
			const { "X-Organization-ID": _, ...rest } = this.baseHeaders;
			this.baseHeaders = rest;
		}

		this.config = { ...this.config, ...config };
	}

	async getSupportState(): Promise<SupportStateResponse> {
		const visitorId = this.resolveVisitorId();

		return this.request<SupportStateResponse>("/support/state", {
			headers: {
				"X-Visitor-Id": visitorId,
			},
		});
	}

	async updateSupportOnboarding(
		update: SupportOnboardingUpdateRequest
	): Promise<SupportStateResponse> {
		const visitorId = this.resolveVisitorId();

		return this.request<SupportStateResponse>("/support/onboarding", {
			method: "PATCH",
			body: JSON.stringify(update),
			headers: {
				"X-Visitor-Id": visitorId,
			},
		});
	}

	async mutateSupportFeatureFlags(
		request: SupportFeatureFlagMutationRequest
	): Promise<SupportFeatureFlagMutationResponse> {
		return this.request<SupportFeatureFlagMutationResponse>(
			"/support/feature-flags",
			{
				method: "PATCH",
				body: JSON.stringify(request),
			}
		);
	}

	destroy(): void {
		this.stopTracking();
	}

	async listConversations(
		params: Partial<ListConversationsRequest> = {}
	): Promise<ListConversationsResponse> {
		// Get visitor ID from storage if we have the website ID, or use the provided one
		const storedVisitorId = this.websiteId
			? getVisitorId(this.websiteId)
			: undefined;
		const visitorId = params.visitorId || this.visitorId || storedVisitorId;

		if (!visitorId) {
			throw new Error("Visitor ID is required");
		}

		// Create query parameters
		const queryParams = new URLSearchParams();

		if (visitorId) {
			queryParams.set("visitorId", visitorId);
		}

		if (params.page) {
			queryParams.set("page", params.page.toString());
		}

		if (params.limit) {
			queryParams.set("limit", params.limit.toString());
		}

		if (params.status) {
			queryParams.set("status", params.status);
		}

		if (params.orderBy) {
			queryParams.set("orderBy", params.orderBy);
		}

		if (params.order) {
			queryParams.set("order", params.order);
		}

		// Add visitor ID header if available
		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const response = await this.request<ListConversationsResponse>(
			`/conversations?${queryParams.toString()}`,
			{
				headers,
			}
		);

		// Convert date strings to Date objects
		return {
			conversations: response.conversations.map((conv) => ({
				...conv,
				createdAt: conv.createdAt,
				updatedAt: conv.updatedAt,
				deletedAt: conv.deletedAt ?? null,
				lastTimelineItem: conv.lastTimelineItem,
			})),
			pagination: response.pagination,
		};
	}

	async getConversation(
		params: GetConversationRequest
	): Promise<GetConversationResponse> {
		// Get visitor ID from storage if we have the website ID
		const visitorId =
			this.visitorId ||
			(this.websiteId ? getVisitorId(this.websiteId) : undefined);

		// Add visitor ID header if available
		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const response = await this.request<GetConversationResponse>(
			`/conversations/${params.conversationId}`,
			{
				headers,
			}
		);

		// Convert date strings to Date objects
		return {
			conversation: {
				...response.conversation,
				createdAt: response.conversation.createdAt,
				updatedAt: response.conversation.updatedAt,
				deletedAt: response.conversation.deletedAt ?? null,
				lastTimelineItem: response.conversation.lastTimelineItem,
			},
		};
	}

	async markConversationSeen(
		params: {
			conversationId: string;
		} & Partial<MarkConversationSeenRequestBody>
	): Promise<MarkConversationSeenResponseBody> {
		const storedVisitorId = this.websiteId
			? getVisitorId(this.websiteId)
			: undefined;
		const visitorId = params.visitorId || this.visitorId || storedVisitorId;

		if (!visitorId) {
			throw new Error("Visitor ID is required to mark a conversation as seen");
		}

		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const body: MarkConversationSeenRequestBody = {};
		if (params.visitorId) {
			body.visitorId = params.visitorId;
		}

		const response = await this.request<MarkConversationSeenResponseBody>(
			`/conversations/${params.conversationId}/seen`,
			{
				method: "POST",
				body: JSON.stringify(body),
				headers,
			}
		);

		return {
			conversationId: response.conversationId,
			lastSeenAt: response.lastSeenAt,
		};
	}

	async getConversationSeenData(params: {
		conversationId: string;
	}): Promise<GetConversationSeenDataResponse> {
		const storedVisitorId = this.websiteId
			? getVisitorId(this.websiteId)
			: undefined;
		const visitorId = this.visitorId || storedVisitorId;

		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const response = await this.request<GetConversationSeenDataResponse>(
			`/conversations/${params.conversationId}/seen`,
			{
				method: "GET",
				headers,
			}
		);

		return {
			seenData: response.seenData.map((item) => ({
				...item,
				lastSeenAt: item.lastSeenAt,
				createdAt: item.createdAt,
				updatedAt: item.updatedAt,
				deletedAt: item.deletedAt ? item.deletedAt : null,
			})),
		};
	}

	async setConversationTyping(params: {
		conversationId: string;
		isTyping: boolean;
		visitorPreview?: string | null;
		visitorId?: string;
	}): Promise<SetConversationTypingResponseBody> {
		const storedVisitorId = this.websiteId
			? getVisitorId(this.websiteId)
			: undefined;
		const visitorId = params.visitorId || this.visitorId || storedVisitorId;

		if (!visitorId) {
			throw new Error("Visitor ID is required to report typing state");
		}

		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const body: SetConversationTypingRequestBody = {
			isTyping: params.isTyping,
		};

		if (params.visitorId) {
			body.visitorId = params.visitorId;
		}

		if (params.visitorPreview && params.isTyping) {
			body.visitorPreview = params.visitorPreview.slice(0, 2000);
		}

		const response = await this.request<SetConversationTypingResponseBody>(
			`/conversations/${params.conversationId}/typing`,
			{
				method: "POST",
				body: JSON.stringify(body),
				headers,
			}
		);

		return {
			conversationId: response.conversationId,
			isTyping: response.isTyping,
			visitorPreview: response.visitorPreview,
			sentAt: response.sentAt,
		};
	}

	async submitConversationRating(
		params: {
			conversationId: string;
		} & SubmitConversationRatingRequestBody
	): Promise<SubmitConversationRatingResponseBody> {
		const storedVisitorId = this.websiteId
			? getVisitorId(this.websiteId)
			: undefined;
		const visitorId = params.visitorId || this.visitorId || storedVisitorId;

		if (!visitorId) {
			throw new Error("Visitor ID is required to submit a rating");
		}

		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const body: SubmitConversationRatingRequestBody = {
			rating: params.rating,
		};

		if (params.comment) {
			body.comment = params.comment;
		}

		if (params.visitorId) {
			body.visitorId = params.visitorId;
		}

		const response = await this.request<SubmitConversationRatingResponseBody>(
			`/conversations/${params.conversationId}/rating`,
			{
				method: "POST",
				body: JSON.stringify(body),
				headers,
			}
		);

		return {
			conversationId: response.conversationId,
			rating: response.rating,
			ratedAt: response.ratedAt,
		};
	}

	async submitFeedback(
		params: SubmitFeedbackRequest
	): Promise<SubmitFeedbackResponse> {
		const storedVisitorId = this.websiteId
			? getVisitorId(this.websiteId)
			: undefined;
		const visitorId = params.visitorId || this.visitorId || storedVisitorId;

		if (!visitorId) {
			throw new Error("Visitor ID is required to submit feedback");
		}

		const headers: Record<string, string> = {
			"X-Visitor-Id": visitorId,
		};

		const body: SubmitFeedbackRequest = {
			rating: params.rating,
			source: params.source ?? "widget",
		};

		if (params.comment) {
			body.comment = params.comment;
		}

		if (params.topic) {
			body.topic = params.topic;
		}

		if (params.trigger) {
			body.trigger = params.trigger;
		}

		if (params.conversationId) {
			body.conversationId = params.conversationId;
		}

		if (params.visitorId) {
			body.visitorId = params.visitorId;
		}

		if (params.contactId) {
			body.contactId = params.contactId;
		}

		return this.request<SubmitFeedbackResponse>("/feedback", {
			method: "POST",
			body: JSON.stringify(body),
			headers,
		});
	}

	async sendMessage(
		params: SendTimelineItemRequest
	): Promise<SendTimelineItemResponse> {
		// Get visitor ID from storage if we have the website ID
		const visitorId =
			this.visitorId ||
			(this.websiteId ? getVisitorId(this.websiteId) : undefined);

		// Add visitor ID header if available
		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const response = await this.request<SendTimelineItemResponse>("/messages", {
			method: "POST",
			body: JSON.stringify(params),
			headers,
		});

		return {
			item: response.item,
		};
	}

	async getConversationTimelineItems(
		params: GetConversationTimelineItemsRequest & { conversationId: string }
	): Promise<GetConversationTimelineItemsResponse> {
		// Get visitor ID from storage if we have the website ID
		const visitorId =
			this.visitorId ||
			(this.websiteId ? getVisitorId(this.websiteId) : undefined);

		// Create query parameters
		const queryParams = new URLSearchParams();

		if (params.limit) {
			queryParams.set("limit", params.limit.toString());
		}

		if (params.cursor) {
			queryParams.set("cursor", params.cursor);
		}

		// Add visitor ID header if available
		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		const response = await this.request<GetConversationTimelineItemsResponse>(
			`/conversations/${params.conversationId}/timeline?${queryParams.toString()}`,
			{
				headers,
			}
		);

		return {
			items: response.items,
			nextCursor: response.nextCursor,
			hasNextPage: response.hasNextPage,
		};
	}

	/**
	 * Generate a presigned URL for uploading a file to S3.
	 * The URL can be used to PUT a file directly to S3.
	 */
	async generateUploadUrl(
		params: Omit<GenerateUploadUrlRequest, "websiteId" | "scope"> & {
			conversationId: string;
		}
	): Promise<GenerateUploadUrlResponse> {
		if (!this.websiteId) {
			throw new Error(
				"Website ID is required. Call getWebsite() first to initialize the client."
			);
		}

		const visitorId = this.resolveVisitorId();

		// Validate file constraints on client side
		if (!isAllowedMimeType(params.contentType)) {
			throw new Error(`File type "${params.contentType}" is not allowed`);
		}

		const headers: Record<string, string> = {};
		if (visitorId) {
			headers["X-Visitor-Id"] = visitorId;
		}

		// Get organization ID from website response (stored during getWebsite)
		// For now, we'll make an additional call to get website info
		const websiteResponse = await this.request<{ organizationId: string }>(
			"/websites",
			{ headers }
		);

		const body: GenerateUploadUrlRequest = {
			contentType: params.contentType,
			websiteId: this.websiteId,
			scope: {
				type: "conversation",
				organizationId: websiteResponse.organizationId,
				websiteId: this.websiteId,
				conversationId: params.conversationId,
			},
			fileName: params.fileName,
			fileExtension: params.fileExtension,
			path: params.path,
			useCdn: false, // Files should not go to CDN
			expiresInSeconds: params.expiresInSeconds,
		};

		const response = await this.request<GenerateUploadUrlResponse>(
			"/uploads/sign-url",
			{
				method: "POST",
				body: JSON.stringify(body),
				headers,
			}
		);

		return response;
	}

	/**
	 * Upload a file to S3 using a presigned URL.
	 * @returns The public URL of the uploaded file
	 */
	async uploadFile(
		file: File,
		uploadUrl: string,
		contentType: string
	): Promise<void> {
		// Validate file before upload
		const validationError = validateFile(file);
		if (validationError) {
			throw new Error(validationError);
		}

		const response = await fetch(uploadUrl, {
			method: "PUT",
			body: file,
			headers: {
				"Content-Type": contentType,
			},
		});

		if (!response.ok) {
			throw new Error(
				`Failed to upload file: ${response.status} ${response.statusText}`
			);
		}
	}

	/**
	 * Upload multiple files for a conversation message.
	 * Files are uploaded in parallel and the function returns timeline parts
	 * that can be included in a message.
	 */
	async uploadFilesForMessage(
		files: File[],
		conversationId: string
	): Promise<
		Array<
			| {
					type: "image";
					url: string;
					mediaType: string;
					fileName?: string;
					size?: number;
			  }
			| {
					type: "file";
					url: string;
					mediaType: string;
					fileName?: string;
					size?: number;
			  }
		>
	> {
		if (files.length === 0) {
			return [];
		}

		// Validate all files first
		for (const file of files) {
			const error = validateFile(file);
			if (error) {
				throw new Error(error);
			}
		}

		// Upload files in parallel
		const uploadPromises = files.map(async (file) => {
			// Generate presigned URL
			const uploadInfo = await this.generateUploadUrl({
				conversationId,
				contentType: file.type,
				fileName: file.name,
			});

			// Upload file to S3
			await this.uploadFile(file, uploadInfo.uploadUrl, file.type);

			// Return timeline part based on file type
			const isImage = file.type.startsWith("image/");
			return {
				type: isImage ? ("image" as const) : ("file" as const),
				url: uploadInfo.publicUrl,
				mediaType: file.type,
				fileName: file.name,
				size: file.size,
			};
		});

		return Promise.all(uploadPromises);
	}
}
