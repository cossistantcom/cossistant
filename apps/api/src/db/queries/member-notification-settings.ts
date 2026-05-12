import type { Database } from "@api/db";
import { memberNotificationSetting } from "@api/db/schema";
import {
	getDefaultMemberNotificationPreference,
	MEMBER_NOTIFICATION_CHANNEL_DEFINITIONS,
	MEMBER_NOTIFICATION_DEFINITION_MAP,
	MemberNotificationChannel,
	type MemberNotificationChannel as MemberNotificationChannelValue,
	type MemberNotificationPreference,
	type MemberNotificationSettingsResponse,
} from "@cossistant/types";
import { and, eq } from "drizzle-orm";

type GetMemberNotificationSettingsParams = {
	organizationId: string;
	memberId: string;
};

type UpdateMemberNotificationSettingsParams =
	GetMemberNotificationSettingsParams & {
		settings: Array<{
			channel: MemberNotificationChannelValue;
			enabled: boolean;
			delaySeconds: number;
			priority?: number;
			config?: Record<string, unknown> | null;
		}>;
	};

export async function getMemberNotificationSettings(
	db: Pick<Database, "select">,
	params: GetMemberNotificationSettingsParams
): Promise<MemberNotificationSettingsResponse> {
	const rows = await db
		.select()
		.from(memberNotificationSetting)
		.where(
			and(
				eq(memberNotificationSetting.memberId, params.memberId),
				eq(memberNotificationSetting.organizationId, params.organizationId)
			)
		);

	const rowMap = new Map<
		MemberNotificationChannelValue,
		(typeof rows)[number]
	>();

	for (const row of rows) {
		rowMap.set(row.channel as MemberNotificationChannelValue, row);
	}

	const settings: MemberNotificationPreference[] =
		MEMBER_NOTIFICATION_CHANNEL_DEFINITIONS.map((definition) => {
			const stored = rowMap.get(definition.channel);

			if (!stored) {
				const defaultPreference = getDefaultMemberNotificationPreference(
					definition.channel
				);

				if (definition.channel !== MemberNotificationChannel.EMAIL_ESCALATION) {
					return defaultPreference;
				}

				const emailNewMessageSetting = rowMap.get(
					MemberNotificationChannel.EMAIL_NEW_MESSAGE
				);

				return {
					...defaultPreference,
					enabled: emailNewMessageSetting?.enabled ?? defaultPreference.enabled,
				};
			}

			return {
				channel: definition.channel,
				label: definition.label,
				description: definition.description,
				enabled: stored.enabled,
				delaySeconds: stored.delaySeconds,
				priority: stored.priority,
				requiresSetup: definition.requiresSetup,
				supportsDelaySeconds: definition.supportsDelaySeconds,
				config: (stored.config ?? definition.defaultConfig ?? null) as Record<
					string,
					unknown
				> | null,
			};
		});

	return {
		organizationId: params.organizationId,
		memberId: params.memberId,
		settings,
	};
}

export async function updateMemberNotificationSettings(
	db: Database,
	params: UpdateMemberNotificationSettingsParams
): Promise<MemberNotificationSettingsResponse> {
	return db.transaction(async (tx) => {
		for (const setting of params.settings) {
			const definition = MEMBER_NOTIFICATION_DEFINITION_MAP.get(
				setting.channel
			);

			if (!definition) {
				continue;
			}

			const delaySeconds = definition.supportsDelaySeconds
				? setting.delaySeconds
				: definition.defaultDelaySeconds;

			const priority = setting.priority ?? definition.defaultPriority;

			await tx
				.insert(memberNotificationSetting)
				.values({
					organizationId: params.organizationId,
					memberId: params.memberId,
					channel: setting.channel,
					enabled: setting.enabled,
					delaySeconds,
					priority,
					config: setting.config ?? null,
				})
				.onConflictDoUpdate({
					target: [
						memberNotificationSetting.memberId,
						memberNotificationSetting.channel,
					],
					set: (() => {
						const baseSet = {
							enabled: setting.enabled,
							delaySeconds,
							priority,
							updatedAt: new Date(),
						} as {
							enabled: boolean;
							delaySeconds: number;
							priority: number;
							updatedAt: Date;
							config?: Record<string, unknown> | null;
						};

						if (setting.config !== undefined) {
							baseSet.config = setting.config ?? null;
						}

						return baseSet;
					})(),
				});
		}

		return getMemberNotificationSettings(tx, {
			organizationId: params.organizationId,
			memberId: params.memberId,
		});
	});
}
