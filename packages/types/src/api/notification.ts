import { z } from "@hono/zod-openapi";

export const MemberNotificationChannel = {
	EMAIL_MARKETING: "email_marketing",
	EMAIL_NEW_MESSAGE: "email_new_message",
	EMAIL_ESCALATION: "email_escalation",
	BROWSER_PUSH_NEW_MESSAGE: "browser_push_new_message",
	SOUND_NEW_MESSAGE: "sound_new_message",
	SOUND_TYPING: "sound_typing",
} as const;

export const memberNotificationChannelSchema = z.nativeEnum(
	MemberNotificationChannel
);

export type MemberNotificationChannel = z.infer<
	typeof memberNotificationChannelSchema
>;

export type MemberNotificationChannelDefinition = {
	channel: MemberNotificationChannel;
	label: string;
	description: string;
	defaultEnabled: boolean;
	defaultDelaySeconds: number;
	defaultPriority: number;
	requiresSetup: boolean;
	supportsDelaySeconds: boolean;
	defaultConfig?: Record<string, unknown> | null;
};

export const MEMBER_NOTIFICATION_CHANNEL_DEFINITIONS = [
	{
		channel: MemberNotificationChannel.EMAIL_MARKETING,
		label: "Marketing emails",
		description: "Product announcements, tips, and updates about Cossistant.",
		defaultEnabled: true,
		defaultDelaySeconds: 0,
		defaultPriority: 30,
		requiresSetup: false,
		supportsDelaySeconds: false,
		defaultConfig: null,
	},
	{
		channel: MemberNotificationChannel.EMAIL_NEW_MESSAGE,
		label: "New message emails",
		description:
			"Send an email if a new customer message hasn't been seen yet.",
		defaultEnabled: true,
		defaultDelaySeconds: 300,
		defaultPriority: 10,
		requiresSetup: false,
		supportsDelaySeconds: true,
		defaultConfig: null,
	},
	{
		channel: MemberNotificationChannel.EMAIL_ESCALATION,
		label: "Human help needed emails",
		description:
			"Send an email when Cossistant escalates a conversation to the team.",
		defaultEnabled: true,
		defaultDelaySeconds: 0,
		defaultPriority: 0,
		requiresSetup: false,
		supportsDelaySeconds: false,
		defaultConfig: null,
	},
	{
		channel: MemberNotificationChannel.BROWSER_PUSH_NEW_MESSAGE,
		label: "Browser push notifications",
		description:
			"Instant alerts in your browser when new customer messages arrive.",
		defaultEnabled: false,
		defaultDelaySeconds: 0,
		defaultPriority: 0,
		requiresSetup: true,
		supportsDelaySeconds: false,
		defaultConfig: null,
	},
	{
		channel: MemberNotificationChannel.SOUND_NEW_MESSAGE,
		label: "New message sounds",
		description: "Play a sound effect when new customer messages arrive.",
		defaultEnabled: true,
		defaultDelaySeconds: 0,
		defaultPriority: 5,
		requiresSetup: false,
		supportsDelaySeconds: false,
		defaultConfig: null,
	},
	{
		channel: MemberNotificationChannel.SOUND_TYPING,
		label: "Typing indicator sounds",
		description:
			"Play a sound effect when someone is typing in a conversation.",
		defaultEnabled: true,
		defaultDelaySeconds: 0,
		defaultPriority: 5,
		requiresSetup: false,
		supportsDelaySeconds: false,
		defaultConfig: null,
	},
] as const satisfies readonly MemberNotificationChannelDefinition[];

export const memberNotificationPreferenceSchema = z.object({
	channel: memberNotificationChannelSchema,
	label: z.string(),
	description: z.string(),
	enabled: z.boolean(),
	delaySeconds: z.number().int().min(0),
	priority: z.number().int(),
	requiresSetup: z.boolean(),
	supportsDelaySeconds: z.boolean(),
	config: z.record(z.string(), z.unknown()).nullable(),
});

export type MemberNotificationPreference = z.infer<
	typeof memberNotificationPreferenceSchema
>;

export const memberNotificationSettingsResponseSchema = z.object({
	organizationId: z.string().ulid(),
	memberId: z.string().ulid(),
	settings: z.array(memberNotificationPreferenceSchema),
});

export type MemberNotificationSettingsResponse = z.infer<
	typeof memberNotificationSettingsResponseSchema
>;

export const updateMemberNotificationSettingsRequestSchema = z.object({
	websiteSlug: z.string(),
	settings: z
		.array(
			z.object({
				channel: memberNotificationChannelSchema,
				enabled: z.boolean(),
				delaySeconds: z.number().int().min(0),
				priority: z.number().int(),
				config: z.record(z.string(), z.unknown()).nullable().optional(),
			})
		)
		.min(1),
});

export type UpdateMemberNotificationSettingsRequest = z.infer<
	typeof updateMemberNotificationSettingsRequestSchema
>;

export const updateMemberNotificationSettingsResponseSchema =
	memberNotificationSettingsResponseSchema;

export type UpdateMemberNotificationSettingsResponse = z.infer<
	typeof updateMemberNotificationSettingsResponseSchema
>;

export const contactNotificationChannelConfigSchema = z
	.object({
		enabled: z.boolean().optional(),
		config: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

export const contactNotificationSettingsSchema = z
	.object({
		emailNotifications: z.boolean().optional(),
		channels: z
			.record(z.string(), contactNotificationChannelConfigSchema)
			.optional(),
	})
	.passthrough();

export type ContactNotificationSettings = z.infer<
	typeof contactNotificationSettingsSchema
>;

export const MEMBER_NOTIFICATION_DEFINITION_MAP =
	MEMBER_NOTIFICATION_CHANNEL_DEFINITIONS.reduce((acc, definition) => {
		acc.set(definition.channel, definition);
		return acc;
	}, new Map<MemberNotificationChannel, MemberNotificationChannelDefinition>());

export function getDefaultMemberNotificationPreference(
	channel: MemberNotificationChannel
): MemberNotificationPreference {
	const definition = MEMBER_NOTIFICATION_DEFINITION_MAP.get(channel);

	if (!definition) {
		throw new Error(`Unknown notification channel: ${channel}`);
	}

	return {
		channel: definition.channel,
		label: definition.label,
		description: definition.description,
		enabled: definition.defaultEnabled,
		delaySeconds: definition.defaultDelaySeconds,
		priority: definition.defaultPriority,
		requiresSetup: definition.requiresSetup,
		supportsDelaySeconds: definition.supportsDelaySeconds,
		config: definition.defaultConfig ?? null,
	};
}
