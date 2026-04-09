import { tool } from "ai";
import { z } from "zod";
import { addInternalNote } from "../actions/internal-note";
import { sendMessage as sendPublicMessage } from "../actions/send-message";
import { normalizePublicReplyText } from "../reply-contract";
import type {
	PipelineToolContext,
	PipelineToolResult,
	ToolTelemetrySpec,
} from "./contracts";

export const MAX_PUBLIC_SENDS_PER_RUN = 3;
const PUBLIC_MESSAGE_DELAY_MS = 900;

const publicMessageInputSchema = z.object({
	message: z
		.string()
		.min(1)
		.describe(
			"Public visitor-facing message. Keep it concise and easy to read in chat."
		),
});

const sendPrivateMessageInputSchema = z.object({
	message: z
		.string()
		.min(1)
		.describe("Private internal note for teammates only."),
});

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function executePublicMessageSend(params: {
	ctx: PipelineToolContext;
	message: string;
}): Promise<PipelineToolResult<{ messageId: string; created: boolean }>> {
	const { ctx, message } = params;
	if (!ctx.allowPublicMessages) {
		return {
			success: false,
			error: "Public messages are disabled for this generation mode",
		};
	}

	const trimmedMessage = message.trim();
	if (!trimmedMessage) {
		return {
			success: false,
			error: "Message is empty",
		};
	}

	if (ctx.runtimeState.publicMessagesSent >= MAX_PUBLIC_SENDS_PER_RUN) {
		return {
			success: false,
			error: `sendMessage can be called at most ${MAX_PUBLIC_SENDS_PER_RUN} times per run`,
		};
	}

	const slot = ctx.runtimeState.publicSendSequence + 1;

	if (slot > 1) {
		await delay(PUBLIC_MESSAGE_DELAY_MS);
	}

	if (ctx.stopTyping) {
		try {
			await ctx.stopTyping();
		} catch (error) {
			ctx.debugLogger?.warn(
				`[ai-pipeline:send-message] conv=${ctx.conversationId} workflowRunId=${ctx.workflowRunId} evt=typing_stop_failed`,
				error
			);
		}
	}

	const result = await sendPublicMessage({
		db: ctx.db,
		conversationId: ctx.conversationId,
		organizationId: ctx.organizationId,
		websiteId: ctx.websiteId,
		visitorId: ctx.visitorId,
		aiAgentId: ctx.aiAgentId,
		text: trimmedMessage,
		idempotencyKey: `public:${ctx.triggerMessageId}:sendMessage:slot:${slot}`,
		createdAt: new Date(Date.now() + slot),
	});

	if (result.paused) {
		return {
			success: false,
			error: "AI is paused for this conversation",
		};
	}

	ctx.runtimeState.publicSendSequence = slot;

	if (
		result.messageId &&
		!ctx.runtimeState.sentPublicMessageIds.has(result.messageId)
	) {
		ctx.runtimeState.sentPublicMessageIds.add(result.messageId);
		ctx.runtimeState.publicMessagesSent += 1;
		ctx.runtimeState.publicReplyTexts ??= [];
		ctx.runtimeState.publicReplyTexts.push(
			normalizePublicReplyText(trimmedMessage)
		);
	}

	return {
		success: true,
		data: {
			messageId: result.messageId,
			created: result.created,
		},
	};
}

export function createSendMessageTool(ctx: PipelineToolContext) {
	return tool({
		description:
			"Send one short visitor-facing chat message. Use 2-3 separate sendMessage calls when shorter bubbles are clearer than one dense block.",
		inputSchema: publicMessageInputSchema,
		execute: ({ message }) =>
			executePublicMessageSend({
				ctx,
				message,
			}),
	});
}

export function createSendPrivateMessageTool(ctx: PipelineToolContext) {
	return tool({
		description: "Send an internal private note to teammates.",
		inputSchema: sendPrivateMessageInputSchema,
		execute: async ({
			message,
		}): Promise<PipelineToolResult<{ noteId: string; created: boolean }>> => {
			ctx.runtimeState.privateSendSequence += 1;
			const slot = ctx.runtimeState.privateSendSequence;
			const result = await addInternalNote({
				db: ctx.db,
				conversationId: ctx.conversationId,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				visitorId: ctx.visitorId,
				aiAgentId: ctx.aiAgentId,
				text: message,
				idempotencyKey: `private:${ctx.triggerMessageId}:slot:${slot}`,
			});

			return {
				success: true,
				data: {
					noteId: result.noteId,
					created: result.created,
				},
			};
		},
	});
}

export const SEND_MESSAGE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Sending chat reply...",
		result: "Sent chat reply",
		error: "Failed to send chat reply",
	},
	progress: {
		partial: "Preparing reply...",
		result: "Reply sent",
		error: "Failed to send reply",
		audience: "all",
	},
};

export const SEND_PRIVATE_MESSAGE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Saving internal note...",
		result: "Saved internal note",
		error: "Failed to save internal note",
	},
	progress: {
		partial: "Saving internal note...",
		result: "Internal note saved",
		error: "Failed to save internal note",
		audience: "dashboard",
	},
};
