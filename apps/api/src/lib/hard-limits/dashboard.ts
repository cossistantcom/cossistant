import type { DatabaseClient } from "@api/db";
import {
	getHardLimitRollingWindowStart,
	getRollingWindowConversationHardLimitCutoff,
	isRollingWindowMessageLimitReached,
} from "@api/db/queries/usage";
import type { PlanInfo } from "@api/lib/plans/access";
import {
	applyDashboardConversationHardLimitLock,
	type ConversationHardLimitCutoff,
	type DashboardLockableConversation,
	isConversationAfterHardLimitCutoff,
} from "@plasma/types/trpc/conversation-hard-limit";

export type DashboardHardLimitPolicy = {
	enforced: boolean;
	unavailableReason: PlanInfo["hardLimitsUnavailableReason"];
	windowStart: string;
	messageLimit: number | null;
	conversationLimit: number | null;
};

export function toNumericHardLimit(value: unknown): number | null {
	return typeof value === "number" ? value : null;
}

export function resolveDashboardHardLimitPolicy(
	planInfo: PlanInfo,
	now: Date = new Date()
): DashboardHardLimitPolicy {
	return {
		enforced: planInfo.hardLimitsEnforced,
		unavailableReason: planInfo.hardLimitsUnavailableReason,
		windowStart: getHardLimitRollingWindowStart(now),
		messageLimit: toNumericHardLimit(planInfo.features.messages),
		conversationLimit: toNumericHardLimit(planInfo.features.conversations),
	};
}

export async function getDashboardConversationLockCutoff(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
		policy: DashboardHardLimitPolicy;
	}
): Promise<ConversationHardLimitCutoff | null> {
	const { policy } = params;

	if (!policy.enforced || policy.conversationLimit === null) {
		return null;
	}

	const result = await getRollingWindowConversationHardLimitCutoff(db, {
		websiteId: params.websiteId,
		organizationId: params.organizationId,
		limit: policy.conversationLimit,
		windowStart: policy.windowStart,
	});

	return result.cutoff;
}

export function isDashboardConversationLocked(params: {
	conversation: Pick<DashboardLockableConversation, "id" | "createdAt">;
	policy: DashboardHardLimitPolicy;
	cutoff: ConversationHardLimitCutoff | null;
}): boolean {
	if (!params.policy.enforced) {
		return false;
	}

	return isConversationAfterHardLimitCutoff(params.conversation, params.cutoff);
}

export function applyDashboardConversationHardLimit<
	T extends DashboardLockableConversation,
>(params: {
	conversation: T;
	policy: DashboardHardLimitPolicy;
	cutoff: ConversationHardLimitCutoff | null;
}) {
	return applyDashboardConversationHardLimitLock({
		conversation: params.conversation,
		cutoff: params.policy.enforced ? params.cutoff : null,
	});
}

export async function isDashboardMessageLimitReached(
	db: DatabaseClient,
	params: {
		websiteId: string;
		organizationId: string;
		policy: DashboardHardLimitPolicy;
	}
): Promise<boolean> {
	const { policy } = params;

	if (!policy.enforced || policy.messageLimit === null) {
		return false;
	}

	return isRollingWindowMessageLimitReached(db, {
		websiteId: params.websiteId,
		organizationId: params.organizationId,
		limit: policy.messageLimit,
		windowStart: policy.windowStart,
	});
}
