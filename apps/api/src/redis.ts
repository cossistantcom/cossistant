/**
 * Redis connection for API
 */

import { env } from "@api/env";
import { createRedisConnection, type Redis } from "@plasma/redis";

let redis: Redis | null = null;

/**
 * Get the Redis connection, creating it if needed
 */
export function getRedis(): Redis {
	if (!redis) {
		redis = createRedisConnection(env.REDIS_URL);
	}
	return redis;
}

/**
 * Wait for Redis connection to be ready
 */
export async function waitForRedis(): Promise<Redis> {
	const client = getRedis();

	if (client.status === "ready") {
		return client;
	}

	return new Promise((resolve, reject) => {
		client.once("ready", () => resolve(client));
		client.once("error", reject);
	});
}

/**
 * Close the Redis connection
 */
export async function closeRedis(): Promise<void> {
	if (redis) {
		await redis.quit();
		redis = null;
	}
}
