import { describe, expect, it } from "bun:test";
import type { Redis } from "@plasma/redis";
import {
	clearAiAgentRunCursorIfMatches,
	getAiAgentRunCursor,
	setAiAgentRunCursor,
} from "./ai-agent-run-cursor";

class FakeRedis {
	private values = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.values.get(key) ?? null;
	}

	async set(
		key: string,
		value: string,
		...args: unknown[]
	): Promise<"OK" | null> {
		const condition = args[2] as string | undefined;
		if (condition === "NX" && this.values.has(key)) {
			return null;
		}
		this.values.set(key, value);
		return "OK";
	}

	async del(key: string): Promise<number> {
		return this.values.delete(key) ? 1 : 0;
	}

	async eval(
		_script: string,
		_numKeys: number,
		key: string,
		payload: string
	): Promise<number> {
		if (this.values.get(key) === payload) {
			this.values.delete(key);
			return 1;
		}
		return 0;
	}
}

describe("clearAiAgentRunCursorIfMatches", () => {
	it("clears the cursor when expected value matches", async () => {
		const redis = new FakeRedis() as unknown as Redis;

		await setAiAgentRunCursor(redis, {
			conversationId: "conv-1",
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});

		const cleared = await clearAiAgentRunCursorIfMatches(redis, {
			conversationId: "conv-1",
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});

		expect(cleared).toBe(true);
		expect(await getAiAgentRunCursor(redis, "conv-1")).toBeNull();
	});

	it("does not clear the cursor when value changed concurrently", async () => {
		const redis = new FakeRedis() as unknown as Redis;

		await setAiAgentRunCursor(redis, {
			conversationId: "conv-1",
			messageId: "msg-2",
			messageCreatedAt: "2026-03-04T10:00:01.000Z",
		});

		const cleared = await clearAiAgentRunCursorIfMatches(redis, {
			conversationId: "conv-1",
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});

		expect(cleared).toBe(false);
		expect(await getAiAgentRunCursor(redis, "conv-1")).toEqual({
			messageId: "msg-2",
			messageCreatedAt: "2026-03-04T10:00:01.000Z",
		});
	});
});
