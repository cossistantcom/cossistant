import { randomUUID } from "node:crypto";
import type { Redis } from "@plasma/redis";

const ACQUIRE_CRAWL_SLOT_SCRIPT = `
for _, key in ipairs(KEYS) do
  if redis.call('SET', key, ARGV[1], 'PX', ARGV[2], 'NX') then
    return key
  end
end
return false
`;

const REFRESH_CRAWL_SLOT_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_CRAWL_SLOT_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export type CrawlSlotLeaseContext = {
	jobId: string;
	linkSourceId: string;
	url: string;
};

export type CrawlSlotLease = CrawlSlotLeaseContext & {
	key: string;
	slotIndex: number;
	token: string;
	acquiredAt: number;
};

export type CrawlSlotManager = {
	acquire(context: CrawlSlotLeaseContext): Promise<CrawlSlotLease | null>;
	renew(lease: CrawlSlotLease): Promise<boolean>;
	release(lease: CrawlSlotLease): Promise<boolean>;
	close?(): Promise<void>;
};

type RedisLeaseClient = Pick<Redis, "eval" | "quit">;

type RedisCrawlSlotManagerOptions = {
	redis: RedisLeaseClient;
	slotCount: number;
	ttlMs: number;
	prefix?: string;
	now?: () => number;
	createToken?: (context: CrawlSlotLeaseContext) => string;
};

const DEFAULT_SLOT_PREFIX = "web-crawl:global-slot";

function buildSlotKeys(prefix: string, slotCount: number): string[] {
	return Array.from(
		{ length: slotCount },
		(_, index) => `${prefix}:${index + 1}`
	);
}

export class RedisCrawlSlotManager implements CrawlSlotManager {
	private redis: RedisLeaseClient;
	private slotKeys: string[];
	private ttlMs: number;
	private now: () => number;
	private createToken: (context: CrawlSlotLeaseContext) => string;

	constructor(options: RedisCrawlSlotManagerOptions) {
		this.redis = options.redis;
		this.slotKeys = buildSlotKeys(
			options.prefix ?? DEFAULT_SLOT_PREFIX,
			options.slotCount
		);
		this.ttlMs = options.ttlMs;
		this.now = options.now ?? (() => Date.now());
		this.createToken =
			options.createToken ??
			((context) => `${context.jobId}:${context.linkSourceId}:${randomUUID()}`);
	}

	async acquire(
		context: CrawlSlotLeaseContext
	): Promise<CrawlSlotLease | null> {
		const token = this.createToken(context);
		const acquiredKey = await this.redis.eval(
			ACQUIRE_CRAWL_SLOT_SCRIPT,
			this.slotKeys.length,
			...this.slotKeys,
			token,
			String(this.ttlMs)
		);

		if (typeof acquiredKey !== "string") {
			return null;
		}

		const slotIndex = this.slotKeys.indexOf(acquiredKey);
		if (slotIndex === -1) {
			return null;
		}

		return {
			...context,
			key: acquiredKey,
			slotIndex: slotIndex + 1,
			token,
			acquiredAt: this.now(),
		};
	}

	async renew(lease: CrawlSlotLease): Promise<boolean> {
		const renewed = await this.redis.eval(
			REFRESH_CRAWL_SLOT_SCRIPT,
			1,
			lease.key,
			lease.token,
			String(this.ttlMs)
		);
		return Number(renewed) === 1;
	}

	async release(lease: CrawlSlotLease): Promise<boolean> {
		const released = await this.redis.eval(
			RELEASE_CRAWL_SLOT_SCRIPT,
			1,
			lease.key,
			lease.token
		);
		return Number(released) === 1;
	}

	async close(): Promise<void> {
		await this.redis.quit();
	}
}
