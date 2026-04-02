import {
	pauseAiForConversation,
	resumeAiForConversation,
} from "@api/ai-pipeline/shared/safety/kill-switch";
import {
	archiveConversation,
	type ConversationRecord,
	joinEscalation,
	markConversationAsNotSpam,
	markConversationAsRead,
	markConversationAsSpam,
	markConversationAsUnread,
	reopenConversation,
	resolveConversation,
	unarchiveConversation,
	updateConversationTitle,
} from "@api/db/mutations/conversation";
import {
	getConversationById,
	getConversationTimelineItems,
	listConversationsHeaders,
} from "@api/db/queries/conversation";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { env } from "@api/env";
import {
	applyDashboardConversationHardLimit,
	getDashboardConversationLockCutoff,
	isDashboardConversationLocked,
	isDashboardMessageLimitReached,
	resolveDashboardHardLimitPolicy,
} from "@api/lib/hard-limits/dashboard";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { realtime } from "@api/realtime/emitter";
import { getRedis } from "@api/redis";
import { createConversationEvent } from "@api/utils/conversation-event";
import { createParticipantJoinedEvent } from "@api/utils/conversation-events";
import {
	emitConversationSeenEvent,
	emitConversationTypingEvent,
} from "@api/utils/conversation-realtime";
import {
	addConversationParticipant,
	isUserParticipant,
} from "@api/utils/participant-helpers";
import { triggerMessageNotificationWorkflow } from "@api/utils/send-message-with-notification";
import { createMessageTimelineItem } from "@api/utils/timeline-item";
import {
	type ContactMetadata,
	ConversationEventType,
	conversationMutationResponseSchema,
	listConversationHeadersResponseSchema,
	TimelineItemVisibility,
	visitorResponseSchema,
} from "@plasma/types";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { loadConversationContext } from "../utils/conversation";

const MESSAGE_LIMIT_LOCK_NAMESPACE = "dashboard-message-hard-limit";
const AI_PAUSE_DURATION_MAX_MINUTES = 60 * 24 * 365 * 100;
const AI_PAUSE_FURTHER_NOTICE_MINUTES = 60 * 24 * 365 * 99;

function buildMessageLimitLockKey(websiteId: string): string {
	return `${MESSAGE_LIMIT_LOCK_NAMESPACE}:${websiteId}`;
}

function toConversationOutput(record: ConversationRecord) {
	return {
		...record,
	};
}

async function emitConversationStatusUpdate(
	conversation: ConversationRecord,
	updates: {
		status?: ConversationRecord["status"];
		deletedAt?: string | null;
		aiPausedUntil?: string | null;
	}
) {
	await realtime.emit("conversationUpdated", {
		websiteId: conversation.websiteId,
		organizationId: conversation.organizationId,
		visitorId: conversation.visitorId ?? null,
		userId: null,
		conversationId: conversation.id,
		updates,
		aiAgentId: null,
	});
}

async function emitConversationMetadataUpdate(
	conversation: ConversationRecord,
	updates: {
		title?: string | null;
		viewIds?: string[];
		sentiment?: ConversationRecord["sentiment"];
		sentimentConfidence?: number | null;
	}
) {
	await realtime.emit("conversationUpdated", {
		websiteId: conversation.websiteId,
		organizationId: conversation.organizationId,
		visitorId: conversation.visitorId ?? null,
		userId: null,
		conversationId: conversation.id,
		updates,
		aiAgentId: null,
	});
}

function buildAiPauseEventMessage(durationMinutes: number): string {
	if (durationMinutes >= AI_PAUSE_FURTHER_NOTICE_MINUTES) {
		return "paused AI answers until further notice";
	}

	if (durationMinutes === 10) {
		return "paused AI answers for 10-min";
	}

	if (durationMinutes === 60) {
		return "paused AI answers for 1-hour";
	}

	return `paused AI answers for ${durationMinutes}-min`;
}

export const conversationRouter = createTRPCRouter({
	listConversationsHeaders: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				limit: z.number().int().min(1).max(500).optional(),
				cursor: z.string().nullable().optional(),
			})
		)
		.output(listConversationHeadersResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [planInfo, result] = await Promise.all([
				getPlanForWebsite(websiteData),
				listConversationsHeaders(db, {
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					userId: user.id,
					limit: input.limit,
					cursor: input.cursor,
				}),
			]);

			const hardLimitPolicy = resolveDashboardHardLimitPolicy(planInfo);
			const lockCutoff = await getDashboardConversationLockCutoff(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
				policy: hardLimitPolicy,
			});

			const items = result.items.map((item) =>
				applyDashboardConversationHardLimit({
					conversation: item,
					cutoff: lockCutoff,
					policy: hardLimitPolicy,
				})
			);

			return {
				items,
				nextCursor: result.nextCursor,
			};
		}),

	getConversationTimelineItems: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
				limit: z.number().int().min(1).max(100).optional().default(50),
				cursor: z.union([z.string(), z.date()]).nullable().optional(),
			})
		)
		.query(async ({ ctx: { db, user }, input }) => {
			// Query website access and conversation in parallel
			const [websiteData, conversation] = await Promise.all([
				getWebsiteBySlugWithAccess(db, {
					userId: user.id,
					websiteSlug: input.websiteSlug,
				}),
				getConversationById(db, {
					conversationId: input.conversationId,
				}),
			]);

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			if (!conversation || conversation.websiteId !== websiteData.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Conversation not found",
				});
			}

			const planInfo = await getPlanForWebsite(websiteData);
			const hardLimitPolicy = resolveDashboardHardLimitPolicy(planInfo);
			const lockCutoff = await getDashboardConversationLockCutoff(db, {
				websiteId: websiteData.id,
				organizationId: websiteData.organizationId,
				policy: hardLimitPolicy,
			});

			if (
				isDashboardConversationLocked({
					conversation: {
						id: conversation.id,
						createdAt: conversation.createdAt,
					},
					cutoff: lockCutoff,
					policy: hardLimitPolicy,
				})
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"Conversation locked because your conversation hard limit was reached.",
				});
			}

			// Get timeline items
			const result = await getConversationTimelineItems(db, {
				organizationId: websiteData.organizationId,
				conversationId: input.conversationId,
				websiteId: websiteData.id,
				limit: input.limit,
				cursor: input.cursor,
			});

			return {
				items: result.items.map((item) => ({
					id: item.id,
					conversationId: item.conversationId,
					organizationId: item.organizationId,
					visibility: item.visibility,
					type: item.type,
					text: item.text,
					parts: item.parts as unknown[],
					userId: item.userId,
					visitorId: item.visitorId,
					aiAgentId: item.aiAgentId,
					createdAt: item.createdAt,
					deletedAt: item.deletedAt,
				})),
				nextCursor: result.nextCursor ?? null,
				hasNextPage: result.hasNextPage,
			};
		}),

	sendMessage: protectedProcedure
		.input(
			z
				.object({
					conversationId: z.string(),
					websiteSlug: z.string(),
					text: z.string(),
					visibility: z.enum(["public", "private"]).default("public"),
					timelineItemId: z.ulid().optional(),
					// Optional file/image parts to include in the message
					parts: z
						.array(
							z.union([
								z.object({
									type: z.literal("image"),
									url: z.url(),
									mediaType: z.string(),
									fileName: z.string().optional(),
									size: z.number().optional(),
									width: z.number().optional(),
									height: z.number().optional(),
								}),
								z.object({
									type: z.literal("file"),
									url: z.url(),
									mediaType: z.string(),
									fileName: z.string().optional(),
									size: z.number().optional(),
								}),
							])
						)
						.optional(),
				})
				.refine(
					(data) => {
						const hasText = data.text.trim().length > 0;
						const hasParts = data.parts && data.parts.length > 0;
						return hasText || hasParts;
					},
					{
						message:
							"Message must have either text content or file attachments",
						path: ["text"],
					}
				)
		)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const [websiteData, conversation] = await Promise.all([
				getWebsiteBySlugWithAccess(db, {
					userId: user.id,
					websiteSlug: input.websiteSlug,
				}),
				getConversationById(db, {
					conversationId: input.conversationId,
				}),
			]);

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			if (!conversation || conversation.websiteId !== websiteData.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Conversation not found",
				});
			}

			const planInfo = await getPlanForWebsite(websiteData);
			const hardLimitPolicy = resolveDashboardHardLimitPolicy(planInfo);

			const sendMessageWithDb = async (dbClient: typeof db) => {
				// Check if user needs to be added as participant
				const isParticipant = await isUserParticipant(dbClient, {
					conversationId: input.conversationId,
					userId: user.id,
				});

				if (!isParticipant) {
					// Add user as participant
					await addConversationParticipant(dbClient, {
						conversationId: input.conversationId,
						userId: user.id,
						organizationId: websiteData.organizationId,
						reason: "Sent message",
					});

					// Create participant joined event (PUBLIC so visitor sees it)
					await createParticipantJoinedEvent(dbClient, {
						conversationId: input.conversationId,
						organizationId: websiteData.organizationId,
						websiteId: websiteData.id,
						visitorId: conversation.visitorId,
						targetUserId: user.id,
						isAutoAdded: true,
					});
				}

				const { item: createdTimelineItem } = await createMessageTimelineItem({
					db: dbClient,
					organizationId: websiteData.organizationId,
					websiteId: websiteData.id,
					conversationId: input.conversationId,
					conversationOwnerVisitorId: conversation.visitorId,
					id: input.timelineItemId,
					text: input.text,
					extraParts: input.parts ?? [],
					visibility: input.visibility,
					userId: user.id,
					visitorId: null,
					aiAgentId: null,
				});

				// Mark conversation as read by user after sending timeline item
				const { lastSeenAt } = await markConversationAsRead(dbClient, {
					conversation,
					actorUserId: user.id,
				});

				await emitConversationSeenEvent({
					conversation,
					actor: { type: "user", userId: user.id },
					lastSeenAt,
				});

				return {
					item: createdTimelineItem,
					actor: { type: "user", userId: user.id } as const,
				};
			};

			const sendResult =
				!hardLimitPolicy.enforced || hardLimitPolicy.messageLimit === null
					? await sendMessageWithDb(db)
					: await db.transaction(async (tx) => {
							const lockKey = buildMessageLimitLockKey(websiteData.id);
							const txDb = tx as unknown as typeof db;

							await txDb.execute(
								sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`
							);

							const reached = await isDashboardMessageLimitReached(txDb, {
								websiteId: websiteData.id,
								organizationId: websiteData.organizationId,
								policy: hardLimitPolicy,
							});

							if (reached) {
								throw new TRPCError({
									code: "FORBIDDEN",
									message:
										"Message hard limit reached for your rolling 30-day window.",
								});
							}

							return sendMessageWithDb(txDb);
						});

			try {
				await triggerMessageNotificationWorkflow({
					conversationId: input.conversationId,
					messageId: sendResult.item.id,
					websiteId: websiteData.id,
					organizationId: websiteData.organizationId,
					actor: sendResult.actor,
				});
			} catch (error) {
				console.error(
					"[notification] Failed to trigger workflow for trpc conversation message",
					error
				);
			}

			return { item: sendResult.item };
		}),

	markResolved: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await resolveConversation(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to resolve conversation",
				});
			}

			await emitConversationStatusUpdate(updatedConversation, {
				status: updatedConversation.status,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markOpen: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await reopenConversation(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to reopen conversation",
				});
			}

			await emitConversationStatusUpdate(updatedConversation, {
				status: updatedConversation.status,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markSpam: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await markConversationAsSpam(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to mark conversation as spam",
				});
			}

			await emitConversationStatusUpdate(updatedConversation, {
				status: updatedConversation.status,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markNotSpam: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await markConversationAsNotSpam(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to mark conversation as not spam",
				});
			}

			await emitConversationStatusUpdate(updatedConversation, {
				status: updatedConversation.status,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markArchived: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await archiveConversation(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to archive conversation",
				});
			}

			await emitConversationStatusUpdate(updatedConversation, {
				deletedAt: updatedConversation.deletedAt,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markUnarchived: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await unarchiveConversation(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to unarchive conversation",
				});
			}

			await emitConversationStatusUpdate(updatedConversation, {
				deletedAt: updatedConversation.deletedAt,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markRead: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const { conversation: updatedConversation, lastSeenAt } =
				await markConversationAsRead(db, {
					conversation,
					actorUserId: user.id,
				});

			await emitConversationSeenEvent({
				conversation: updatedConversation,
				actor: { type: "user", userId: user.id },
				lastSeenAt,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markUnread: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await markConversationAsUnread(db, {
				conversation,
				actorUserId: user.id,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	updateTitle: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
				title: z.string().nullable(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const normalizedTitle = input.title?.trim() || null;
			const updatedConversation = await updateConversationTitle(db, {
				conversation,
				title: normalizedTitle,
				titleSource: "user",
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to update conversation title",
				});
			}

			await emitConversationMetadataUpdate(updatedConversation, {
				title: updatedConversation.title,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	pauseAi: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
				durationMinutes: z
					.number()
					.int()
					.min(1)
					.max(AI_PAUSE_DURATION_MAX_MINUTES)
					.optional(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const durationMinutes =
				input.durationMinutes ?? env.AI_AGENT_ROGUE_PAUSE_MINUTES;

			const updatedConversation = await pauseAiForConversation({
				db,
				redis: getRedis(),
				conversationId: conversation.id,
				organizationId: conversation.organizationId,
				durationMinutes,
				reason: `manual:${user.id}`,
				mode: "replace",
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to pause AI for conversation",
				});
			}

			await Promise.all([
				emitConversationStatusUpdate(updatedConversation, {
					aiPausedUntil: updatedConversation.aiPausedUntil,
				}),
				createConversationEvent({
					db,
					context: {
						conversationId: updatedConversation.id,
						organizationId: updatedConversation.organizationId,
						websiteId: updatedConversation.websiteId,
						visitorId: updatedConversation.visitorId,
					},
					event: {
						type: ConversationEventType.AI_PAUSED,
						actorUserId: user.id,
						message: buildAiPauseEventMessage(durationMinutes),
						visibility: TimelineItemVisibility.PRIVATE,
					},
				}),
			]);

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	resumeAi: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await resumeAiForConversation({
				db,
				redis: getRedis(),
				conversationId: conversation.id,
				organizationId: conversation.organizationId,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to resume AI for conversation",
				});
			}

			await Promise.all([
				emitConversationStatusUpdate(updatedConversation, {
					aiPausedUntil: null,
				}),
				createConversationEvent({
					db,
					context: {
						conversationId: updatedConversation.id,
						organizationId: updatedConversation.organizationId,
						websiteId: updatedConversation.websiteId,
						visitorId: updatedConversation.visitorId,
					},
					event: {
						type: ConversationEventType.AI_RESUMED,
						actorUserId: user.id,
						message: "resumed AI answers",
						visibility: TimelineItemVisibility.PRIVATE,
					},
				}),
			]);

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	joinEscalation: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation, website } = await loadConversationContext(
				db,
				user.id,
				input
			);

			// Check if user is already a participant
			const isParticipant = await isUserParticipant(db, {
				conversationId: input.conversationId,
				userId: user.id,
			});

			if (!isParticipant) {
				// Add user as participant
				await addConversationParticipant(db, {
					conversationId: input.conversationId,
					userId: user.id,
					organizationId: website.organizationId,
					reason: "Joined escalation",
				});
			}

			// Always create participant joined event when handling escalation (PUBLIC so visitor sees it)
			await createParticipantJoinedEvent(db, {
				conversationId: input.conversationId,
				organizationId: website.organizationId,
				websiteId: website.id,
				visitorId: conversation.visitorId,
				targetUserId: user.id,
				actorUserId: user.id,
				isAutoAdded: false,
				customMessage: "joined to help",
			});

			// Mark escalation as handled
			const updatedConversation = await joinEscalation(db, {
				conversation,
				actorUserId: user.id,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	setTyping: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
				isTyping: z.boolean(),
			})
		)
		.output(
			z.object({
				success: z.literal(true),
			})
		)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(db, user.id, {
				websiteSlug: input.websiteSlug,
				conversationId: input.conversationId,
			});

			await emitConversationTypingEvent({
				conversation,
				actor: { type: "user", userId: user.id },
				isTyping: input.isTyping,
			});

			return { success: true } as const;
		}),

	getVisitorById: protectedProcedure
		.input(
			z.object({
				visitorId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(visitorResponseSchema.nullable())
		.query(async ({ ctx: { db, user }, input }) => {
			// Query website access and visitor in parallel
			const [websiteData, visitor] = await Promise.all([
				getWebsiteBySlugWithAccess(db, {
					userId: user.id,
					websiteSlug: input.websiteSlug,
				}),
				getCompleteVisitorWithContact(db, {
					visitorId: input.visitorId,
				}),
			]);

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			if (!visitor || visitor.websiteId !== websiteData.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Visitor not found",
				});
			}

			return {
				...visitor,
				contact: visitor.contact
					? {
							...visitor.contact,
							metadata: visitor.contact.metadata as ContactMetadata,
						}
					: null,
				isBlocked: Boolean(visitor.blockedAt),
			};
		}),
});
