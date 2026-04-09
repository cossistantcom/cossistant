import { z } from "zod";

export const lifecyclePayloadSchema = z.object({
	eventType: z.enum([
		"email.delivered",
		"email.bounced",
		"email.complained",
		"email.failed",
	]),
	eventId: z.string().min(1),
	occurredAt: z.string().min(1),
	recipientEmail: z.string().email(),
	messageId: z.string().min(1).nullable().optional(),
	bounce: z
		.object({
			type: z.string().min(1),
			subType: z.string().nullable().optional(),
			message: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	failure: z
		.object({
			reason: z.string().min(1),
		})
		.nullable()
		.optional(),
	provider: z.literal("ses").optional(),
});

export const receivedEmailPayloadSchema = z.object({
	eventType: z.literal("email.received"),
	from: z.string().min(1),
	to: z.array(z.string().min(1)).min(1),
	subject: z.string().default(""),
	messageId: z.string().min(1).nullable().optional(),
	receivedAt: z.string().min(1),
	text: z.string().nullable().optional(),
	html: z.string().nullable().optional(),
	textWithoutSignature: z.string().nullable().optional(),
	inboundAddress: z.string().nullable().optional(),
	s3Bucket: z.string().nullable().optional(),
	s3Key: z.string().nullable().optional(),
	provider: z.literal("ses").optional(),
});

export const sesEventEnvelopeSchema = z.union([
	lifecyclePayloadSchema,
	z.array(lifecyclePayloadSchema).min(1),
]);

export const sesInboundEnvelopeSchema = z.union([
	receivedEmailPayloadSchema,
	z.array(receivedEmailPayloadSchema).min(1),
]);
