import { z } from "@hono/zod-openapi";
import { apiTimestampSchema } from "./common";

// Feedback schema for responses
export const feedbackSchema = z
	.object({
		id: z.string().openapi({
			description: "Unique identifier for the feedback",
		}),
		organizationId: z.string().openapi({
			description: "Organization ID",
		}),
		websiteId: z.string().openapi({
			description: "Website ID the feedback belongs to",
		}),
		conversationId: z.string().nullable().openapi({
			description: "Conversation ID if feedback is tied to a conversation",
		}),
		visitorId: z.string().nullable().openapi({
			description: "Visitor ID who submitted the feedback",
		}),
		contactId: z.string().nullable().openapi({
			description: "Contact ID if visitor has one",
		}),
		rating: z.number().int().min(1).max(5).openapi({
			description: "Rating from 1 to 5",
			example: 5,
		}),
		topic: z.string().nullable().openapi({
			description: "Optional structured topic selected by the visitor",
		}),
		comment: z.string().nullable().openapi({
			description: "Optional written feedback",
		}),
		trigger: z.string().nullable().openapi({
			description:
				"What triggered this feedback (e.g., 'churn', 'conversation_resolved', 'nps_survey')",
		}),
		source: z.string().openapi({
			description: "Source of the feedback (e.g., 'widget', 'api', 'email')",
			default: "widget",
		}),
		createdAt: apiTimestampSchema.openapi({
			description: "When the feedback was submitted",
		}),
		updatedAt: apiTimestampSchema.openapi({
			description: "When the feedback was last updated",
		}),
	})
	.openapi({
		description: "Feedback record",
	});

export type Feedback = z.infer<typeof feedbackSchema>;

// Submit feedback request
export const submitFeedbackRequestSchema = z
	.object({
		rating: z.number().int().min(1).max(5).openapi({
			description: "Rating from 1 to 5",
			example: 5,
		}),
		topic: z.string().optional().openapi({
			description: "Optional structured topic selected by the visitor",
		}),
		comment: z.string().optional().openapi({
			description: "Optional written feedback",
		}),
		trigger: z.string().optional().openapi({
			description:
				"What triggered this feedback (e.g., 'churn', 'conversation_resolved', 'nps_survey')",
		}),
		source: z.string().default("widget").openapi({
			description: "Source of the feedback (e.g., 'widget', 'api', 'email')",
			default: "widget",
		}),
		conversationId: z.string().optional().openapi({
			description: "Conversation ID if feedback is tied to a conversation",
		}),
		visitorId: z.string().optional().openapi({
			description: "Visitor ID who submitted the feedback",
		}),
		contactId: z.string().optional().openapi({
			description: "Contact ID if visitor has one",
		}),
	})
	.openapi({
		description: "Request body for submitting feedback",
	});

export type SubmitFeedbackRequest = z.infer<typeof submitFeedbackRequestSchema>;

export const submitFeedbackResponseSchema = z
	.object({
		feedback: feedbackSchema,
	})
	.openapi({
		description: "Response containing the created feedback",
	});

export type SubmitFeedbackResponse = z.infer<
	typeof submitFeedbackResponseSchema
>;

// List feedback request
export const listFeedbackRequestSchema = z
	.object({
		trigger: z.string().optional().openapi({
			description: "Filter by trigger type",
		}),
		source: z.string().optional().openapi({
			description: "Filter by source",
		}),
		conversationId: z.string().optional().openapi({
			description: "Filter by conversation ID",
		}),
		visitorId: z.string().optional().openapi({
			description: "Filter by visitor ID",
		}),
		page: z.coerce.number().min(1).default(1).openapi({
			description: "Page number for pagination",
			default: 1,
		}),
		limit: z.coerce.number().min(1).max(100).default(20).openapi({
			description: "Number of items per page",
			default: 20,
		}),
	})
	.openapi({
		description: "Query parameters for listing feedback",
	});

export type ListFeedbackRequest = z.infer<typeof listFeedbackRequestSchema>;

export const listFeedbackResponseSchema = z
	.object({
		feedback: z.array(feedbackSchema),
		pagination: z.object({
			page: z.number(),
			limit: z.number(),
			total: z.number(),
			totalPages: z.number(),
			hasMore: z.boolean(),
		}),
	})
	.openapi({
		description: "Paginated list of feedback",
	});

export type ListFeedbackResponse = z.infer<typeof listFeedbackResponseSchema>;

// Get feedback by ID
export const getFeedbackResponseSchema = z
	.object({
		feedback: feedbackSchema,
	})
	.openapi({
		description: "Response containing a single feedback record",
	});

export type GetFeedbackResponse = z.infer<typeof getFeedbackResponseSchema>;
