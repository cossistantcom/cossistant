/**
 * Channel-aware rate limiting.
 * - Text: 10 messages/min, 60 messages/hr per visitor
 * - Voice: 3 sessions/day, 15 min max per visitor
 * - API: standard rate per API key
 */

interface RateBucket {
  count: number;
  resetAt: number;
}

// In-memory rate limiter (use Redis in production)
const buckets = new Map<string, RateBucket>();
const MAX_BUCKETS = 10_000;

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const CHANNEL_LIMITS: Record<string, RateLimitConfig> = {
  text: { maxRequests: 10, windowMs: 60_000 }, // 10/min
  text_hourly: { maxRequests: 60, windowMs: 3_600_000 }, // 60/hr
  voice: { maxRequests: 3, windowMs: 86_400_000 }, // 3/day
  api: { maxRequests: 100, windowMs: 60_000 }, // 100/min
};

export function checkRateLimit(
  visitorId: string,
  channel: string,
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = CHANNEL_LIMITS[channel] ?? CHANNEL_LIMITS.text;
  const key = `${visitorId}:${channel}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + config.windowMs };
    buckets.set(key, bucket);
  }

  // Evict oldest entries if at capacity (before inserting new bucket)
  if (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }

  bucket.count++;
  const allowed = bucket.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - bucket.count);

  return { allowed, remaining, resetAt: bucket.resetAt };
}

// Cleanup expired buckets every 60 seconds
export const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}, 60_000);

export function stopRateLimiterCleanup(): void {
  clearInterval(cleanupTimer);
}
