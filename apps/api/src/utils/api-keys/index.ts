import { createHmac, randomBytes } from "node:crypto";
import { APIKeyType } from "@plasma/types";

export function generateApiKey({
	type,
	isTest,
}: {
	type: APIKeyType;
	isTest: boolean;
}): string {
	let prefix = "";

	if (type === APIKeyType.PRIVATE) {
		prefix = "sk_";
	} else if (type === APIKeyType.PUBLIC) {
		prefix = "pk_";
	}

	if (isTest) {
		prefix = `${prefix}test_`;
	}

	// Generate 32 random bytes and convert to hex
	const randomString = randomBytes(32).toString("hex");
	return `${prefix}${randomString}`;
}

export function isValidSecretApiKeyFormat(key: string): boolean {
	return key.startsWith("sk_") && (key.length === 67 || key.length === 72);
}

export function isValidPublicApiKeyFormat(key: string): boolean {
	return key.startsWith("pk_") && (key.length === 67 || key.length === 72);
}

export function hashApiKey(rawKey: string, secret: string): string {
	return createHmac("sha256", secret).update(rawKey).digest("hex");
}
