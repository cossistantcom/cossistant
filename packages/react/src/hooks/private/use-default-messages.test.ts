import { describe, expect, it } from "bun:test";
import { type DefaultMessage, SenderType } from "@cossistant/types";
import { reconcileDefaultMessageSeeds } from "./use-default-messages";

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function createDefaultMessage(
	overrides: Partial<DefaultMessage> = {}
): DefaultMessage {
	return {
		content: "Hello there",
		senderType: SenderType.AI,
		senderId: "01JTESTAGENT0000000000000",
		...overrides,
	};
}

describe("reconcileDefaultMessageSeeds", () => {
	it("keeps ids and timestamps stable for unchanged default messages", () => {
		const defaultMessages = [
			createDefaultMessage(),
			createDefaultMessage({
				content: "How can I help?",
				senderType: SenderType.TEAM_MEMBER,
				senderId: "01JTESTUSER00000000000000",
			}),
		];

		const first = reconcileDefaultMessageSeeds(defaultMessages, []);
		const second = reconcileDefaultMessageSeeds(defaultMessages, first);

		expect(second).toHaveLength(2);
		expect(second[0]?.id).toBe(first[0]?.id);
		expect(second[1]?.id).toBe(first[1]?.id);
		expect(second[0]?.createdAt).toBe(first[0]?.createdAt);
		expect(second[1]?.createdAt).toBe(first[1]?.createdAt);
	});

	it("regenerates the changed message seed while preserving unchanged ones", () => {
		const initialMessages = [
			createDefaultMessage({
				content: "Welcome",
			}),
			createDefaultMessage({
				content: "What can we do for you?",
			}),
		];
		const first = reconcileDefaultMessageSeeds(initialMessages, []);

		const updatedMessages = [
			createDefaultMessage({
				content: "Welcome",
			}),
			createDefaultMessage({
				content: "What do you need help with today?",
			}),
		];
		const second = reconcileDefaultMessageSeeds(updatedMessages, first);

		expect(second[0]?.id).toBe(first[0]?.id);
		expect(second[1]?.id).not.toBe(first[1]?.id);
	});

	it("generates ULID-based ids client side", () => {
		const defaultMessages = [createDefaultMessage()];
		const seeds = reconcileDefaultMessageSeeds(defaultMessages, []);
		const firstSeedId = seeds[0]?.id ?? "";

		expect(ULID_REGEX.test(firstSeedId)).toBe(true);
	});

	it("always generates a valid ISO createdAt, even without a window global", () => {
		// Regression: server-side seeds used to get createdAt "", which
		// rendered "Invalid Date" in SSR HTML.
		const seeds = reconcileDefaultMessageSeeds([createDefaultMessage()], []);
		const createdAt = seeds[0]?.createdAt ?? "";

		expect(createdAt).not.toBe("");
		expect(Number.isNaN(new Date(createdAt).getTime())).toBe(false);
	});
});
