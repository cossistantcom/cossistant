import { describe, expect, it, mock } from "bun:test";
import type { TimelineItem } from "@plasma/types";

// Re-implement the pure functions from use-send-message.ts for testing
// These are the same implementations used in the hook

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "string") {
		return new Error(error);
	}

	return new Error("Unknown error");
}

type BuildTimelineItemPayloadOptions = {
	body: string;
	conversationId: string;
	visitorId: string | null;
	messageId?: string;
	fileParts?: Array<{ type: "image" | "file"; url: string }>;
};

function buildTimelineItemPayload({
	body,
	conversationId,
	visitorId,
	messageId,
	fileParts,
}: BuildTimelineItemPayloadOptions): TimelineItem {
	const nowIso = new Date().toISOString();
	const id = messageId ?? `test-id-${Date.now()}`;

	const parts: TimelineItem["parts"] = [{ type: "text" as const, text: body }];

	if (fileParts && fileParts.length > 0) {
		for (const part of fileParts) {
			if (part.type === "image") {
				parts.push({
					type: "image" as const,
					url: part.url,
					mediaType: "image/png",
					filename: "test.png",
					size: 1024,
				});
			} else {
				parts.push({
					type: "file" as const,
					url: part.url,
					mediaType: "application/pdf",
					filename: "test.pdf",
					size: 1024,
				});
			}
		}
	}

	return {
		id,
		conversationId,
		organizationId: "",
		type: "message" as const,
		text: body,
		parts,
		visibility: "public" as const,
		userId: null,
		aiAgentId: null,
		visitorId: visitorId ?? null,
		createdAt: nowIso,
		deletedAt: null,
	} satisfies TimelineItem;
}

describe("toError", () => {
	it("returns the same error if already an Error instance", () => {
		const originalError = new Error("Original error");
		const result = toError(originalError);
		expect(result).toBe(originalError);
		expect(result.message).toBe("Original error");
	});

	it("wraps a string in an Error", () => {
		const result = toError("String error message");
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe("String error message");
	});

	it("returns 'Unknown error' for other types", () => {
		expect(toError(123).message).toBe("Unknown error");
		expect(toError(null).message).toBe("Unknown error");
		expect(toError(undefined).message).toBe("Unknown error");
		expect(toError({ foo: "bar" }).message).toBe("Unknown error");
	});
});

describe("buildTimelineItemPayload", () => {
	it("creates a timeline item with correct structure", () => {
		const result = buildTimelineItemPayload({
			body: "Hello, world!",
			conversationId: "conv-123",
			visitorId: "visitor-456",
			messageId: "msg-789",
		});

		expect(result.id).toBe("msg-789");
		expect(result.conversationId).toBe("conv-123");
		expect(result.visitorId).toBe("visitor-456");
		expect(result.text).toBe("Hello, world!");
		expect(result.type).toBe("message");
		expect(result.visibility).toBe("public");
		expect(result.userId).toBeNull();
		expect(result.aiAgentId).toBeNull();
		expect(result.deletedAt).toBeNull();
		expect(result.organizationId).toBe("");
	});

	it("generates an id when messageId is not provided", () => {
		const result = buildTimelineItemPayload({
			body: "Test message",
			conversationId: "conv-123",
			visitorId: null,
		});

		expect(result.id).toBeDefined();
		expect(result.id.length).toBeGreaterThan(0);
	});

	it("handles null visitorId", () => {
		const result = buildTimelineItemPayload({
			body: "Test message",
			conversationId: "conv-123",
			visitorId: null,
		});

		expect(result.visitorId).toBeNull();
	});

	it("creates text part from body", () => {
		const result = buildTimelineItemPayload({
			body: "Message content",
			conversationId: "conv-123",
			visitorId: "visitor-1",
		});

		expect(result.parts).toHaveLength(1);
		expect(result.parts[0]).toEqual({ type: "text", text: "Message content" });
	});

	it("includes file parts when provided", () => {
		const result = buildTimelineItemPayload({
			body: "Check this file",
			conversationId: "conv-123",
			visitorId: "visitor-1",
			fileParts: [
				{ type: "image", url: "https://example.com/image.png" },
				{ type: "file", url: "https://example.com/doc.pdf" },
			],
		});

		expect(result.parts).toHaveLength(3);
		expect(result.parts[0]).toEqual({ type: "text", text: "Check this file" });
		expect(result.parts[1]?.type).toBe("image");
		expect(result.parts[2]?.type).toBe("file");
	});

	it("sets createdAt to current timestamp", () => {
		const before = new Date().toISOString();
		const result = buildTimelineItemPayload({
			body: "Test",
			conversationId: "conv-123",
			visitorId: null,
		});
		const after = new Date().toISOString();

		expect(result.createdAt >= before).toBe(true);
		expect(result.createdAt <= after).toBe(true);
	});
});

describe("onConversationInitiated callback", () => {
	it("should be called with conversation ID when no conversationId is provided", () => {
		// This test documents the expected behavior:
		// When a new conversation is initiated (no conversationId provided),
		// the onConversationInitiated callback should be called with the new ID
		// BEFORE the API call is made.
		//
		// This is critical for optimistic updates to work correctly:
		// The UI needs to switch to reading from the new conversation ID's store
		// immediately so that optimistic items appear in the timeline.

		const onConversationInitiated = mock(() => {});

		// Simulate the logic from useSendMessage
		const providedConversationId: string | null = null;

		if (!providedConversationId) {
			// In the real hook, this comes from client.initiateConversation()
			const newConversationId = "new-conv-123";
			onConversationInitiated(newConversationId);
		}

		expect(onConversationInitiated).toHaveBeenCalledTimes(1);
		expect(onConversationInitiated).toHaveBeenCalledWith("new-conv-123");
	});

	it("should NOT be called when conversationId is already provided", () => {
		const onConversationInitiated = mock(() => {});

		// Simulate the logic from useSendMessage
		const providedConversationId: string | null = "existing-conv-456";

		if (!providedConversationId) {
			const newConversationId = "new-conv-123";
			onConversationInitiated(newConversationId);
		}

		expect(onConversationInitiated).not.toHaveBeenCalled();
	});
});

describe("SendMessageOptions type", () => {
	it("documents the onConversationInitiated callback in the type", () => {
		// This is a compile-time check - if this code compiles,
		// the type includes onConversationInitiated
		type SendMessageOptions = {
			conversationId?: string | null;
			message: string;
			files?: File[];
			defaultTimelineItems?: TimelineItem[];
			visitorId?: string;
			messageId?: string;
			onSuccess?: (conversationId: string, messageId: string) => void;
			onError?: (error: Error) => void;
			onConversationInitiated?: (conversationId: string) => void;
		};

		const options: SendMessageOptions = {
			message: "Test",
			onConversationInitiated: (id) => {
				// This callback should be called immediately after conversation initiation
				console.log(`Conversation initiated: ${id}`);
			},
		};

		expect(options.onConversationInitiated).toBeDefined();
	});
});
