import { describe, expect, it, mock } from "bun:test";

const APIKeyType = {
	PRIVATE: "private",
	PUBLIC: "public",
} as const;

mock.module("@plasma/types", () => ({
	APIKeyType,
}));

const {
	generateApiKey,
	hashApiKey,
	isValidPublicApiKeyFormat,
	isValidSecretApiKeyFormat,
} = await import("./index");

const HEX_REGEX = /^[0-9a-f]+$/;

describe("api-keys utils", () => {
	describe("generateApiKey", () => {
		describe("PRIVATE keys", () => {
			it("should generate private key with correct prefix for production", () => {
				const key = generateApiKey({ type: APIKeyType.PRIVATE, isTest: false });
				expect(key).toStartWith("sk_");
				expect(key).not.toInclude("test_");
				expect(key).toHaveLength(67); // sk_ (3) + 64 hex chars
			});

			it("should generate private key with test prefix for test mode", () => {
				const key = generateApiKey({ type: APIKeyType.PRIVATE, isTest: true });
				expect(key).toStartWith("sk_test_");
				expect(key).toHaveLength(72); // sk_test_ (8) + 64 hex chars
			});

			it("should generate unique keys", () => {
				const key1 = generateApiKey({
					type: APIKeyType.PRIVATE,
					isTest: false,
				});
				const key2 = generateApiKey({
					type: APIKeyType.PRIVATE,
					isTest: false,
				});
				expect(key1).not.toBe(key2);
			});

			it("should generate keys with valid hex characters", () => {
				const key = generateApiKey({ type: APIKeyType.PRIVATE, isTest: false });
				const hexPart = key.replace("sk_", "");
				expect(hexPart).toMatch(HEX_REGEX);
			});
		});

		describe("PUBLIC keys", () => {
			it("should generate public key with correct prefix for production", () => {
				const key = generateApiKey({ type: APIKeyType.PUBLIC, isTest: false });
				expect(key).toStartWith("pk_");
				expect(key).not.toInclude("test_");
				expect(key).toHaveLength(67); // pk_ (3) + 64 hex chars
			});

			it("should generate public key with test prefix for test mode", () => {
				const key = generateApiKey({ type: APIKeyType.PUBLIC, isTest: true });
				expect(key).toStartWith("pk_test_");
				expect(key).toHaveLength(72); // pk_test_ (8) + 64 hex chars
			});

			it("should generate unique keys", () => {
				const key1 = generateApiKey({ type: APIKeyType.PUBLIC, isTest: false });
				const key2 = generateApiKey({ type: APIKeyType.PUBLIC, isTest: false });
				expect(key1).not.toBe(key2);
			});

			it("should generate keys with valid hex characters", () => {
				const key = generateApiKey({ type: APIKeyType.PUBLIC, isTest: false });
				const hexPart = key.replace("pk_", "");
				expect(hexPart).toMatch(HEX_REGEX);
			});
		});
	});

	describe("isValidSecretApiKeyFormat", () => {
		it("should return true for valid production secret key", () => {
			const validKey = `sk_${"a".repeat(64)}`;
			expect(isValidSecretApiKeyFormat(validKey)).toBe(true);
		});

		it("should return true for valid test secret key", () => {
			const validKey = `sk_test_${"a".repeat(64)}`;
			expect(isValidSecretApiKeyFormat(validKey)).toBe(true);
		});

		it("should return false for keys without sk_ prefix", () => {
			const invalidKey = `pk_${"a".repeat(64)}`;
			expect(isValidSecretApiKeyFormat(invalidKey)).toBe(false);
		});

		it("should return false for keys with wrong length", () => {
			const shortKey = `sk_${"a".repeat(60)}`;
			const longKey = `sk_${"a".repeat(70)}`;
			expect(isValidSecretApiKeyFormat(shortKey)).toBe(false);
			expect(isValidSecretApiKeyFormat(longKey)).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isValidSecretApiKeyFormat("")).toBe(false);
		});

		it("should return false for malformed keys", () => {
			expect(isValidSecretApiKeyFormat("sk")).toBe(false);
			expect(isValidSecretApiKeyFormat("sk_")).toBe(false);
			expect(isValidSecretApiKeyFormat("invalid")).toBe(false);
		});

		it("should handle keys with correct format but different content", () => {
			const keyWithNumbers = `sk_${"1".repeat(64)}`;
			const keyWithMixed = `sk_${"1a2b3c".repeat(10)}1234`;
			expect(isValidSecretApiKeyFormat(keyWithNumbers)).toBe(true);
			expect(isValidSecretApiKeyFormat(keyWithMixed)).toBe(true);
		});
	});

	describe("isValidPublicApiKeyFormat", () => {
		it("should return true for valid production public key", () => {
			const validKey = `pk_${"a".repeat(64)}`;
			expect(isValidPublicApiKeyFormat(validKey)).toBe(true);
		});

		it("should return true for valid test public key", () => {
			const validKey = `pk_test_${"a".repeat(64)}`;
			expect(isValidPublicApiKeyFormat(validKey)).toBe(true);
		});

		it("should return false for keys without pk_ prefix", () => {
			const invalidKey = `sk_${"a".repeat(64)}`;
			expect(isValidPublicApiKeyFormat(invalidKey)).toBe(false);
		});

		it("should return false for keys with wrong length", () => {
			const shortKey = `pk_${"a".repeat(60)}`;
			const longKey = `pk_${"a".repeat(70)}`;
			expect(isValidPublicApiKeyFormat(shortKey)).toBe(false);
			expect(isValidPublicApiKeyFormat(longKey)).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isValidPublicApiKeyFormat("")).toBe(false);
		});

		it("should return false for malformed keys", () => {
			expect(isValidPublicApiKeyFormat("pk")).toBe(false);
			expect(isValidPublicApiKeyFormat("pk_")).toBe(false);
			expect(isValidPublicApiKeyFormat("invalid")).toBe(false);
		});

		it("should handle keys with correct format but different content", () => {
			const keyWithNumbers = `pk_${"1".repeat(64)}`;
			const keyWithMixed = `pk_${"1a2b3c".repeat(10)}1234`;
			expect(isValidPublicApiKeyFormat(keyWithNumbers)).toBe(true);
			expect(isValidPublicApiKeyFormat(keyWithMixed)).toBe(true);
		});
	});

	describe("hashApiKey", () => {
		const testKey =
			"sk_test_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
		const testSecret = "test-secret";

		it("should return a consistent hash for the same inputs", () => {
			const hash1 = hashApiKey(testKey, testSecret);
			const hash2 = hashApiKey(testKey, testSecret);
			expect(hash1).toBe(hash2);
		});

		it("should return different hashes for different keys", () => {
			const key2 =
				"sk_test_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
			const hash1 = hashApiKey(testKey, testSecret);
			const hash2 = hashApiKey(key2, testSecret);
			expect(hash1).not.toBe(hash2);
		});

		it("should return different hashes for different secrets", () => {
			const secret2 = "different-secret";
			const hash1 = hashApiKey(testKey, testSecret);
			const hash2 = hashApiKey(testKey, secret2);
			expect(hash1).not.toBe(hash2);
		});

		it("should return a hex string", () => {
			const hash = hashApiKey(testKey, testSecret);
			expect(hash).toMatch(HEX_REGEX);
			expect(hash).toHaveLength(64); // SHA256 hex output length
		});

		it("should handle empty strings", () => {
			const hashEmptyKey = hashApiKey("", testSecret);
			const hashEmptySecret = hashApiKey(testKey, "");
			const hashBothEmpty = hashApiKey("", "");

			expect(hashEmptyKey).toMatch(HEX_REGEX);
			expect(hashEmptySecret).toMatch(HEX_REGEX);
			expect(hashBothEmpty).toMatch(HEX_REGEX);

			// All should be different
			expect(hashEmptyKey).not.toBe(hashEmptySecret);
			expect(hashEmptyKey).not.toBe(hashBothEmpty);
			expect(hashEmptySecret).not.toBe(hashBothEmpty);
		});

		it("should handle special characters in inputs", () => {
			const specialKey = "sk_test_!@#$%^&*()_+-=[]{}|;:,.<>?";
			const specialSecret = "secret!@#$%^&*()";
			const hash = hashApiKey(specialKey, specialSecret);
			expect(hash).toMatch(HEX_REGEX);
			expect(hash).toHaveLength(64);
		});
	});

	describe("integration tests", () => {
		it("should validate generated keys correctly", () => {
			const privateKey = generateApiKey({
				type: APIKeyType.PRIVATE,
				isTest: false,
			});
			const publicKey = generateApiKey({
				type: APIKeyType.PUBLIC,
				isTest: false,
			});
			const testPrivateKey = generateApiKey({
				type: APIKeyType.PRIVATE,
				isTest: true,
			});
			const testPublicKey = generateApiKey({
				type: APIKeyType.PUBLIC,
				isTest: true,
			});

			expect(isValidSecretApiKeyFormat(privateKey)).toBe(true);
			expect(isValidPublicApiKeyFormat(publicKey)).toBe(true);
			expect(isValidSecretApiKeyFormat(testPrivateKey)).toBe(true);
			expect(isValidPublicApiKeyFormat(testPublicKey)).toBe(true);

			// Cross validation should fail
			expect(isValidSecretApiKeyFormat(publicKey)).toBe(false);
			expect(isValidPublicApiKeyFormat(privateKey)).toBe(false);
		});

		it("should hash all types of generated keys", () => {
			const keys = [
				generateApiKey({ type: APIKeyType.PRIVATE, isTest: false }),
				generateApiKey({ type: APIKeyType.PUBLIC, isTest: false }),
				generateApiKey({ type: APIKeyType.PRIVATE, isTest: true }),
				generateApiKey({ type: APIKeyType.PUBLIC, isTest: true }),
			];

			const secret = "test-secret";
			const hashes = keys.map((key) => hashApiKey(key, secret));

			// All hashes should be different
			const uniqueHashes = new Set(hashes);
			expect(uniqueHashes.size).toBe(keys.length);

			// All hashes should be valid hex strings
			for (const hash of hashes) {
				expect(hash).toMatch(HEX_REGEX);
				expect(hash).toHaveLength(64);
			}
		});
	});
});
