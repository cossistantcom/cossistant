import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT =
	process.env.VAPID_SUBJECT ?? "mailto:support@plasma-pandora.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
	webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
	console.warn(
		"[web-push] VAPID keys not configured. Push notifications will not work."
	);
}

export type PushSubscriptionData = {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
};

export type PushNotificationPayload = {
	title: string;
	body: string;
	icon?: string;
	badge?: string;
	tag?: string;
	data?: Record<string, unknown>;
};

/**
 * Send a push notification to a subscription
 * Returns true if successful, false if failed (subscription may be invalid)
 */
export async function sendPushNotification(
	subscription: PushSubscriptionData,
	payload: PushNotificationPayload
): Promise<{ success: boolean; error?: string }> {
	if (!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)) {
		return { success: false, error: "VAPID keys not configured" };
	}

	try {
		await webpush.sendNotification(subscription, JSON.stringify(payload));
		return { success: true };
	} catch (error) {
		// Handle specific error codes
		// 404 or 410 means subscription is no longer valid
		if (
			error instanceof webpush.WebPushError &&
			(error.statusCode === 404 || error.statusCode === 410)
		) {
			return {
				success: false,
				error: "subscription_expired",
			};
		}

		console.error("[web-push] Error sending push notification:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Validate that a push subscription object has the required fields
 */
export function isValidPushSubscription(
	data: unknown
): data is PushSubscriptionData {
	if (!data || typeof data !== "object") {
		return false;
	}

	const sub = data as Record<string, unknown>;

	if (typeof sub.endpoint !== "string" || !sub.endpoint) {
		return false;
	}

	if (!sub.keys || typeof sub.keys !== "object") {
		return false;
	}

	const keys = sub.keys as Record<string, unknown>;

	if (typeof keys.p256dh !== "string" || !keys.p256dh) {
		return false;
	}

	if (typeof keys.auth !== "string" || !keys.auth) {
		return false;
	}

	return true;
}
