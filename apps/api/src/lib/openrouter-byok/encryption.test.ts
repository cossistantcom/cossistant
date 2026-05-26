import { describe, expect, it } from "bun:test";
import {
	decryptOpenRouterApiKey,
	encryptOpenRouterApiKey,
	maskOpenRouterApiKey,
} from "./encryption";

describe("OpenRouter BYOK encryption", () => {
	const apiKey = "sk-or-v1-1234567890abcdef1234567890abcdef";
	const secret = "test-api-key-secret";

	it("round trips an API key", () => {
		const encryptedApiKey = encryptOpenRouterApiKey({ apiKey, secret });

		expect(decryptOpenRouterApiKey({ encryptedApiKey, secret })).toEqual(
			apiKey
		);
	});

	it("uses random ciphertext for the same plaintext", () => {
		const first = encryptOpenRouterApiKey({ apiKey, secret });
		const second = encryptOpenRouterApiKey({ apiKey, secret });

		expect(first).not.toEqual(second);
		expect(decryptOpenRouterApiKey({ encryptedApiKey: first, secret })).toEqual(
			apiKey
		);
		expect(
			decryptOpenRouterApiKey({ encryptedApiKey: second, secret })
		).toEqual(apiKey);
	});

	it("fails with the wrong secret", () => {
		const encryptedApiKey = encryptOpenRouterApiKey({ apiKey, secret });

		expect(() =>
			decryptOpenRouterApiKey({
				encryptedApiKey,
				secret: "wrong-secret",
			})
		).toThrow();
	});

	it("masks keys without exposing the full value", () => {
		const masked = maskOpenRouterApiKey(apiKey);

		expect(masked).toBe("sk-or-v1...abcdef");
		expect(masked).not.toContain("1234567890abcdef1234567890");
	});
});
